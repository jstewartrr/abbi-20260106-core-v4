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
Assignee: ${task.assignee?.name || 'Unassigned'}
Due Date: ${task.due_on || 'No due date'}
Section: ${task.section || 'No section'}
Description: ${task.notes || 'No description'}
Completed: ${task.completed ? 'Yes' : 'No'}
${task.attachments?.length > 0 ? `Attachments: ${task.attachments.map(a => a.name).join(', ')}` : ''}

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
      mpDashboard: '1209103059237595',
      weeklyItems: '1209022810695498'
    };

    // Fetch all required tasks in parallel
    const [
      myRecentSubmissions,
      myWeeklyItems,
      teamWeeklyCompleted,
      allMpTasks,
      allWeeklyTasks
    ] = await Promise.all([
      // 1. My tasks in MP Dashboard Recent Submissions section
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.mpDashboard,
        assignee: userConfig.asanaGid,
        completed: false
      }),
      // 2. My tasks in Weekly Items
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.weeklyItems,
        assignee: userConfig.asanaGid,
        completed: false
      }),
      // 3. Team completed tasks (last 24h) in Weekly Items
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.weeklyItems,
        completed_since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      }),
      // 4. All incomplete MP Dashboard tasks (for team tasks due today/overdue)
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.mpDashboard,
        completed: false
      }),
      // 5. All incomplete Weekly Items (for team tasks due today/overdue)
      mcpCall(GATEWAY_URL, 'asana_list_tasks', {
        project_id: userConfig.weeklyItems,
        completed: false
      })
    ]);

    const today = new Date().toISOString().split('T')[0];
    const allTasks = [];

    // Process my tasks - Recent Submissions (filter by section)
    const myRecent = (myRecentSubmissions.tasks || []).filter(t =>
      t.section?.includes('Recent') || t.section?.includes('Submission')
    );
    myRecent.forEach(t => allTasks.push({ ...t, category: 'My Tasks - Recent Submissions' }));

    // Process my tasks - Weekly Items
    (myWeeklyItems.tasks || []).forEach(t =>
      allTasks.push({ ...t, category: 'My Tasks - Weekly Items' })
    );

    // Process team completed (exclude me, only last 24h)
    (teamWeeklyCompleted.tasks || [])
      .filter(t => t.assignee?.gid !== userConfig.asanaGid && t.completed)
      .forEach(t => allTasks.push({ ...t, category: 'Team Completed (24h)' }));

    // Process team due today/overdue (exclude me)
    const teamTasks = [
      ...(allMpTasks.tasks || []),
      ...(allWeeklyTasks.tasks || [])
    ].filter(t => t.assignee?.gid !== userConfig.asanaGid && !t.completed);

    teamTasks.forEach(t => {
      if (t.due_on) {
        const dueDate = t.due_on.split('T')[0];
        if (dueDate < today) {
          allTasks.push({ ...t, category: 'Team Past Due' });
        } else if (dueDate === today) {
          allTasks.push({ ...t, category: 'Team Due Today' });
        }
      }
    });

    console.log(`📊 Total tasks collected: ${allTasks.length}`);
    console.log(`   - My Recent Submissions: ${myRecent.length}`);
    console.log(`   - My Weekly Items: ${(myWeeklyItems.tasks || []).length}`);
    console.log(`   - Team Completed: ${allTasks.filter(t => t.category === 'Team Completed (24h)').length}`);
    console.log(`   - Team Due Today: ${allTasks.filter(t => t.category === 'Team Due Today').length}`);
    console.log(`   - Team Past Due: ${allTasks.filter(t => t.category === 'Team Past Due').length}`);

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
        return `(
          '${t.gid}',
          '${escape(t.name)}',
          '${escape(t.assignee?.name || 'Unassigned')}',
          '${t.due_on || ''}',
          '${t.category}',
          '${escape(t.section || '')}',
          ${t.completed},
          '${escape(t.ai_summary)}',
          '${escape(t.draft_comment)}',
          '${escape(t.action_plan)}',
          '${escape(t.priority_assessment)}',
          '${escape(t.blockers)}',
          '${escape(t.permalink_url || '')}',
          CURRENT_TIMESTAMP()
        )`;
      }).join(',\n');

      const insertSQL = `
        INSERT INTO SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS (
          TASK_GID, TASK_NAME, ASSIGNEE_NAME, DUE_DATE, CATEGORY, SECTION,
          COMPLETED, AI_SUMMARY, DRAFT_COMMENT, ACTION_PLAN, PRIORITY_ASSESSMENT,
          BLOCKERS, PERMALINK_URL, PROCESSED_AT
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
