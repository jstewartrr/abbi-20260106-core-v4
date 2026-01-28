// Fetch Asana tasks from Snowflake for dashboard display
// Similar pattern to /api/email/triaged-emails.js

const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60, // 1 minute max
};

async function mcpCall(gateway, tool, args = {}, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(gateway, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: tool, arguments: args },
          id: Date.now() + attempt
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      const content = data.result?.content?.[0];
      if (content?.type === 'text') {
        // Check if response indicates an error
        if (content.text.startsWith('Error:')) {
          throw new Error(content.text);
        }
        return JSON.parse(content.text);
      }

      return content;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        // Exponential backoff: 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        console.log(`   Retry ${attempt + 1}/${retries} for ${tool}...`);
      }
    }
  }

  throw lastError;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    console.log('\n=== FETCHING ASANA TASKS FROM SNOWFLAKE ===');
    const startTime = Date.now();

    // Fetch all tasks from Snowflake
    const query = `
      SELECT
        TASK_GID,
        TASK_NAME,
        PROJECT,
        ASSIGNEE_NAME,
        ASSIGNEE_GID,
        DUE_DATE,
        CATEGORY,
        SECTION,
        COMPLETED,
        AI_SUMMARY,
        DRAFT_COMMENT,
        ACTION_PLAN,
        PRIORITY_ASSESSMENT,
        BLOCKERS,
        SUBTASKS_JSON,
        COMMENTS_JSON,
        ATTACHMENTS_JSON,
        PERMALINK_URL,
        PROCESSED_AT
      FROM SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS
      WHERE COMPLETED = FALSE
      ORDER BY
        CASE CATEGORY
          WHEN 'My Tasks Past Due' THEN 1
          WHEN 'My Tasks Due Today' THEN 2
          WHEN 'Delegated Tasks Past Due' THEN 3
          WHEN 'Delegated Tasks Due Today' THEN 4
          ELSE 5
        END,
        DUE_DATE ASC,
        TASK_NAME ASC
    `;

    const result = await mcpCall(
      SNOWFLAKE_GATEWAY,
      'sm_query_snowflake',
      { sql: query }
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch tasks from Snowflake');
    }

    const tasks = result.data || [];
    console.log(`✓ Fetched ${tasks.length} tasks from Snowflake`);

    // Group tasks by category
    const grouped = {
      my_tasks_due_today: [],
      my_tasks_past_due: [],
      delegated_tasks_due_today: [],
      delegated_tasks_past_due: []
    };

    // Parse JSON fields and group tasks
    for (const task of tasks) {
      try {
        // Parse JSON fields
        task.subtasks = task.SUBTASKS_JSON ? JSON.parse(task.SUBTASKS_JSON) : [];
        task.comments = task.COMMENTS_JSON ? JSON.parse(task.COMMENTS_JSON) : [];
        task.attachments = task.ATTACHMENTS_JSON ? JSON.parse(task.ATTACHMENTS_JSON) : [];
        task.action_plan = task.ACTION_PLAN ? JSON.parse(task.ACTION_PLAN) : [];
        task.blockers = task.BLOCKERS ? JSON.parse(task.BLOCKERS) : [];

        // Create clean task object
        const cleanTask = {
          gid: task.TASK_GID,
          name: task.TASK_NAME,
          project: task.PROJECT,
          assignee: {
            name: task.ASSIGNEE_NAME,
            gid: task.ASSIGNEE_GID
          },
          due_date: task.DUE_DATE,
          category: task.CATEGORY,
          section: task.SECTION,
          ai_summary: task.AI_SUMMARY,
          draft_comment: task.DRAFT_COMMENT,
          action_plan: task.action_plan,
          priority_assessment: task.PRIORITY_ASSESSMENT,
          blockers: task.blockers,
          subtasks: task.subtasks,
          subtasks_count: task.subtasks.length,
          subtasks_completed: task.subtasks.filter(s => s.completed).length,
          comments: task.comments,
          comments_count: task.comments.length,
          attachments: task.attachments,
          attachments_count: task.attachments.length,
          permalink_url: task.PERMALINK_URL,
          processed_at: task.PROCESSED_AT
        };

        // Group by category
        switch (task.CATEGORY) {
          case 'My Tasks Due Today':
            grouped.my_tasks_due_today.push(cleanTask);
            break;
          case 'My Tasks Past Due':
            grouped.my_tasks_past_due.push(cleanTask);
            break;
          case 'Delegated Tasks Due Today':
            grouped.delegated_tasks_due_today.push(cleanTask);
            break;
          case 'Delegated Tasks Past Due':
            grouped.delegated_tasks_past_due.push(cleanTask);
            break;
        }
      } catch (parseError) {
        console.error(`Error parsing task ${task.TASK_GID}:`, parseError.message);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✓ Grouped tasks by category (${elapsed}ms)`);
    console.log(`   - My Tasks Due Today: ${grouped.my_tasks_due_today.length}`);
    console.log(`   - My Tasks Past Due: ${grouped.my_tasks_past_due.length}`);
    console.log(`   - Delegated Tasks Due Today: ${grouped.delegated_tasks_due_today.length}`);
    console.log(`   - Delegated Tasks Past Due: ${grouped.delegated_tasks_past_due.length}`);
    console.log('=== ASANA TASKS FETCH COMPLETE ===\n');

    return res.status(200).json({
      success: true,
      total_tasks: tasks.length,
      my_tasks_due_today: grouped.my_tasks_due_today,
      my_tasks_past_due: grouped.my_tasks_past_due,
      delegated_tasks_due_today: grouped.delegated_tasks_due_today,
      delegated_tasks_past_due: grouped.delegated_tasks_past_due,
      counts: {
        my_tasks_due_today: grouped.my_tasks_due_today.length,
        my_tasks_past_due: grouped.my_tasks_past_due.length,
        delegated_tasks_due_today: grouped.delegated_tasks_due_today.length,
        delegated_tasks_past_due: grouped.delegated_tasks_past_due.length
      },
      processing_time_ms: elapsed
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
