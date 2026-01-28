// Fetch Asana tasks directly from Asana API (bypassing Snowflake)
// Much faster and simpler approach

const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60,
};

async function mcpCall(tool, args = {}, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: tool, arguments: args },
          id: Date.now() + attempt
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const content = data.result?.content?.[0];
      if (content?.type === 'text') {
        if (content.text.startsWith('Error:')) throw new Error(content.text);
        return JSON.parse(content.text);
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('Fetching tasks directly from Asana...');
    const startTime = Date.now();

    const userConfig = {
      asanaGid: '373563475019846',
      mpDashboard: '1204554210439476',
      weeklyItems: '1212197943409021'
    };

    // Fetch all incomplete tasks from both projects in parallel
    const [mpTasks, weeklyTasks] = await Promise.all([
      mcpCall('asana_list_tasks', {
        project_id: userConfig.mpDashboard,
        completed: false
      }),
      mcpCall('asana_list_tasks', {
        project_id: userConfig.weeklyItems,
        completed: false
      })
    ]);

    const today = new Date().toISOString().split('T')[0];

    // Categorize tasks
    const grouped = {
      my_tasks_due_today: [],
      my_tasks_past_due: [],
      delegated_tasks_due_today: [],
      delegated_tasks_past_due: []
    };

    const allTasks = [
      ...(mpTasks.tasks || []).map(t => ({ ...t, project: 'MP Project Dashboard' })),
      ...(weeklyTasks.tasks || []).map(t => ({ ...t, project: 'Johns Weekly Items' }))
    ];

    for (const task of allTasks) {
      const isAssignedToMe = task.assignee?.gid === userConfig.asanaGid;
      const dueDate = task.due_on ? task.due_on.split('T')[0] : null;

      if (!dueDate) continue; // Skip tasks with no due date

      const cleanTask = {
        gid: task.gid,
        name: task.name,
        project: task.project,
        assignee: {
          name: task.assignee?.name || 'Unassigned',
          gid: task.assignee?.gid || ''
        },
        due_date: dueDate,
        section: task.memberships?.[0]?.section?.name || '',
        ai_summary: `Task: ${task.name}. ${task.notes || 'No description provided.'}`,
        subtasks: [],
        subtasks_count: 0,
        subtasks_completed: 0,
        comments: [],
        comments_count: 0,
        attachments: [],
        attachments_count: 0,
        permalink_url: task.permalink_url || `https://app.asana.com/0/${task.gid}`
      };

      if (isAssignedToMe) {
        if (dueDate === today) {
          cleanTask.category = 'My Tasks Due Today';
          grouped.my_tasks_due_today.push(cleanTask);
        } else if (dueDate < today) {
          cleanTask.category = 'My Tasks Past Due';
          grouped.my_tasks_past_due.push(cleanTask);
        }
      } else if (task.assignee) {
        // Tasks assigned to others (delegated)
        if (dueDate === today) {
          cleanTask.category = 'Delegated Tasks Due Today';
          grouped.delegated_tasks_due_today.push(cleanTask);
        } else if (dueDate < today) {
          cleanTask.category = 'Delegated Tasks Past Due';
          grouped.delegated_tasks_past_due.push(cleanTask);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✓ Fetched and categorized tasks (${elapsed}ms)`);
    console.log(`   - My Tasks Due Today: ${grouped.my_tasks_due_today.length}`);
    console.log(`   - My Tasks Past Due: ${grouped.my_tasks_past_due.length}`);
    console.log(`   - Delegated Tasks Due Today: ${grouped.delegated_tasks_due_today.length}`);
    console.log(`   - Delegated Tasks Past Due: ${grouped.delegated_tasks_past_due.length}`);

    return res.status(200).json({
      success: true,
      total_tasks: allTasks.length,
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
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
