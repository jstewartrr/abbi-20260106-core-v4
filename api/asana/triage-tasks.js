// Asana Task Triage with AI - Similar to email triage
const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://mcp.abbi-ai.com/mcp';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  maxDuration: 300, // 5 minutes max
};

async function mcpCall(gateway, tool, args = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now()
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      const parsed = JSON.parse(content.text);
      if (!parsed.success && parsed.error) throw new Error(parsed.error);
      return parsed;
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Analyze task with AI - generate summary, draft comment, action plan
async function analyzeTaskWithAI(task) {
  try {
    const prompt = `You are an executive assistant for John Stewart, Managing Partner at Middleground Capital (private equity firm).

Analyze this Asana task and provide structured analysis:

Task Name: ${task.name}
Project: ${task.project || 'Unknown'}
Section: ${task.section || 'No section'}
Assignee: ${task.assignee?.name || 'Unassigned'}
Due Date: ${task.due_on || 'No due date'}
Category: ${task.category}
Description: ${task.notes || 'No description'}
Completed: ${task.completed ? 'Yes' : 'No'}
${task.subtasks?.length > 0 ? `Subtasks (${task.subtasks.length}): ${task.subtasks.map(s => `${s.name} [${s.completed ? '✓' : ' '}]`).join(', ')}` : 'Subtasks: None'}
${task.comments?.length > 0 ? `Recent Comments (${task.comments.length}): ${task.comments.slice(-3).map(c => `${c.created_by?.name}: ${c.text?.substring(0, 100)}`).join(' | ')}` : 'Comments: None'}
${task.attachments?.length > 0 ? `Attachments (${task.attachments.length}): ${task.attachments.map(a => a.name).join(', ')}` : 'Attachments: None'}

Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence summary of what this task is about and its current status",
  "draft_comment": "Professional comment John could post to move this task forward or provide guidance",
  "action_plan": ["Next step 1", "Next step 2"] or [] if task is complete,
  "priority_assessment": "Critical/High/Medium/Low with brief reasoning",
  "blockers": ["Potential blocker 1"] or [] if none identified
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (response.ok) {
      const aiData = await response.json();
      let aiText = aiData.content[0].text.trim();
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(aiText);
    }
    return null;
  } catch (error) {
    console.error('AI analysis error:', error.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers['authorization'];
  const webhookSecret = process.env.WEBHOOK_SECRET || 'dev-secret-12345';

  if (authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📋 ASANA TASK TRIAGE TRIGGERED');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    const userConfig = {
      asanaGid: '373563475019846',
      mpDashboard: '1204554210439476', // MP Project Dashboard (correct ID)
      weeklyItems: '1212197943409021'  // Johns Weekly Items (correct ID)
    };

    // Fetch all incomplete tasks from both projects in parallel
    const [allMpTasks, allWeeklyTasks] = await Promise.all([
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.mpDashboard,
        completed: false
      }),
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.weeklyItems,
        completed: false
      })
    ]);

    const today = new Date().toISOString().split('T')[0];
    const allTasks = [];

    // Combine tasks from both projects
    const combinedTasks = [
      ...(allMpTasks.tasks || []).map(t => ({ ...t, project: 'MP Project Dashboard' })),
      ...(allWeeklyTasks.tasks || []).map(t => ({ ...t, project: 'Johns Weekly Items' }))
    ];

    // Categorize tasks based on assignee and due date
    for (const task of combinedTasks) {
      const isAssignedToMe = task.assignee?.gid === userConfig.asanaGid;
      const dueDate = task.due_on ? task.due_on.split('T')[0] : null;

      if (isAssignedToMe && dueDate) {
        // Tasks assigned TO me
        if (dueDate === today) {
          allTasks.push({ ...task, category: 'My Tasks Due Today' });
        } else if (dueDate < today) {
          allTasks.push({ ...task, category: 'My Tasks Past Due' });
        }
      } else if (!isAssignedToMe && task.assignee && dueDate) {
        // Tasks assigned BY me to others (delegated)
        // Note: Asana doesn't have "created_by" in list API, so we assume tasks
        // in user's projects that are assigned to others are delegated by user
        if (dueDate === today) {
          allTasks.push({ ...task, category: 'Delegated Tasks Due Today' });
        } else if (dueDate < today) {
          allTasks.push({ ...task, category: 'Delegated Tasks Past Due' });
        }
      }
    }

    console.log(`📊 Total tasks collected: ${allTasks.length}`);
    console.log(`   - My Tasks Due Today: ${allTasks.filter(t => t.category === 'My Tasks Due Today').length}`);
    console.log(`   - My Tasks Past Due: ${allTasks.filter(t => t.category === 'My Tasks Past Due').length}`);
    console.log(`   - Delegated Tasks Due Today: ${allTasks.filter(t => t.category === 'Delegated Tasks Due Today').length}`);
    console.log(`   - Delegated Tasks Past Due: ${allTasks.filter(t => t.category === 'Delegated Tasks Past Due').length}`);

    // Enrich tasks with subtasks, comments, and attachments
    console.log('\n📦 Fetching task details (subtasks, comments, attachments)...');
    for (const task of allTasks) {
      try {
        // Fetch subtasks, comments, and attachments in parallel for each task
        const [subtasksResult, commentsResult, attachmentsResult] = await Promise.all([
          mcpCall(GATEWAY_URL, 'asana_get_subtasks', { task_id: task.gid }).catch(() => ({ subtasks: [] })),
          mcpCall(GATEWAY_URL, 'asana_get_task_comments', { task_id: task.gid }).catch(() => ({ comments: [] })),
          mcpCall(GATEWAY_URL, 'asana_get_task', { task_id: task.gid }).catch(() => ({ attachments: [] }))
        ]);

        task.subtasks = subtasksResult.subtasks || [];
        task.comments = commentsResult.comments || [];
        task.attachments = attachmentsResult.attachments || [];

        // Add rate limiting to avoid hitting API limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`   Error enriching task ${task.gid}:`, error.message);
        task.subtasks = [];
        task.comments = [];
        task.attachments = [];
      }
    }
    console.log(`   ✓ Enriched ${allTasks.length} tasks with additional details`);

    // AI analysis for each task
    console.log('\n🧠 Analyzing tasks with AI...');
    const analyzedTasks = [];

    for (const task of allTasks) {
      const analysis = await analyzeTaskWithAI(task);
      analyzedTasks.push({
        ...task,
        ai_summary: analysis?.summary || '',
        draft_comment: analysis?.draft_comment || '',
        action_plan: JSON.stringify(analysis?.action_plan || []),
        priority_assessment: analysis?.priority_assessment || '',
        blockers: JSON.stringify(analysis?.blockers || [])
      });
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    }

    console.log(`   ✓ Analyzed ${analyzedTasks.length} tasks`);

    // Save to Snowflake
    console.log('\n💾 Saving to Snowflake...');

    // Clear old tasks
    await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
      sql: 'DELETE FROM SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS'
    });

    // Insert new tasks
    if (analyzedTasks.length > 0) {
      const values = analyzedTasks.map(t => {
        const escape = (str) => str ? str.replace(/'/g, "''").substring(0, 5000) : '';
        const subtasksJson = escape(JSON.stringify(t.subtasks || []));
        const commentsJson = escape(JSON.stringify(t.comments || []));
        const attachmentsJson = escape(JSON.stringify(t.attachments || []));
        return `(
          '${t.gid}',
          '${escape(t.name)}',
          '${escape(t.project || 'Unknown')}',
          '${escape(t.assignee?.name || 'Unassigned')}',
          '${escape(t.assignee?.gid || '')}',
          '${t.due_on || ''}',
          '${t.category}',
          '${escape(t.section || '')}',
          ${t.completed},
          '${escape(t.ai_summary)}',
          '${escape(t.draft_comment)}',
          '${escape(t.action_plan)}',
          '${escape(t.priority_assessment)}',
          '${escape(t.blockers)}',
          '${subtasksJson}',
          '${commentsJson}',
          '${attachmentsJson}',
          '${escape(t.permalink_url || '')}',
          CURRENT_TIMESTAMP()
        )`;
      }).join(',\n');

      const insertSQL = `
        INSERT INTO SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS (
          TASK_GID, TASK_NAME, PROJECT, ASSIGNEE_NAME, ASSIGNEE_GID, DUE_DATE,
          CATEGORY, SECTION, COMPLETED, AI_SUMMARY, DRAFT_COMMENT, ACTION_PLAN,
          PRIORITY_ASSESSMENT, BLOCKERS, SUBTASKS_JSON, COMMENTS_JSON,
          ATTACHMENTS_JSON, PERMALINK_URL, PROCESSED_AT
        ) VALUES ${values}
      `;

      await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql: insertSQL });
      console.log(`   ✓ Saved ${analyzedTasks.length} tasks`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n✅ TASK TRIAGE COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'Task triage completed',
      total_tasks: analyzedTasks.length,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ TASK TRIAGE ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
