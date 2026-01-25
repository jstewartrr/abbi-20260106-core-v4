const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

const USERS = {
  jstewart: {
    name: 'John Stewart',
    email: 'jstewart@middleground.com',
    emailAccounts: ['jstewart@middleground.com', 'john@middleground.com'],
    asanaGid: '373563475019846',
    asanaProjects: {
      mpDashboard: '1209103059237595',
      weeklyItems: '1209022810695498'
    }
  },
  'john.claude': { name: 'John Claude', email: 'John.Claude@middleground.com' }
};

async function mcpCall(url, tool, args = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: Date.now() })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const content = data.result?.content?.[0];
  return content?.type === 'text' ? JSON.parse(content.text) : content;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user } = req.query;
  const userConfig = USERS[user];
  if (!userConfig) return res.status(404).json({ success: false, error: 'User not found' });

  // Fetch emails from multiple accounts if configured
  const emailPromises = userConfig.emailAccounts
    ? userConfig.emailAccounts.map(emailAddr =>
        mcpCall(GATEWAY_URL, 'm365_read_emails', { user: emailAddr, unread_only: true, top: 20 })
      )
    : [mcpCall(GATEWAY_URL, 'm365_read_emails', { user: userConfig.email, unread_only: true, top: 10 })];

  // Fetch tasks from specific Asana projects (assigned to user AND assigned by user)
  const asanaPromises = userConfig.asanaProjects
    ? [
        // Tasks assigned TO jstewart in MP Project Dashboard
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.mpDashboard, assignee: userConfig.asanaGid }),
        // Tasks assigned TO jstewart in Weekly Items
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.weeklyItems, assignee: userConfig.asanaGid }),
        // All incomplete tasks in MP Dashboard (to find ones assigned BY jstewart)
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.mpDashboard, completed: false }),
        // All incomplete tasks in Weekly Items (to find ones assigned BY jstewart)
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.weeklyItems, completed: false })
      ]
    : [Promise.resolve({ tasks: [] })];

  const results = await Promise.allSettled([
    // Calendar from jstewart only
    mcpCall(GATEWAY_URL, 'm365_list_calendar_events', { user: userConfig.email }),
    // Emails from both accounts
    ...emailPromises,
    // Asana tasks
    ...asanaPromises,
    // Hive Mind activity
    mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', { query: "SELECT * FROM SOVEREIGN_MIND.RAW.HIVE_MIND WHERE CREATED_AT > DATEADD(hour, -24, CURRENT_TIMESTAMP()) ORDER BY CREATED_AT DESC LIMIT 5", response_format: 'json' })
  ]);

  // Merge emails from multiple accounts
  const allEmails = [];
  const emailStartIndex = 1;
  const emailEndIndex = emailStartIndex + (userConfig.emailAccounts?.length || 1);
  for (let i = emailStartIndex; i < emailEndIndex; i++) {
    if (results[i]?.status === 'fulfilled') {
      const emails = results[i].value?.emails || results[i].value?.value || [];
      allEmails.push(...emails);
    }
  }

  // Merge Asana tasks from all queries
  const allTasks = [];
  const asanaStartIndex = emailEndIndex;
  const asanaEndIndex = asanaStartIndex + (userConfig.asanaProjects ? 4 : 1);
  const taskIds = new Set(); // Deduplicate tasks
  for (let i = asanaStartIndex; i < asanaEndIndex; i++) {
    if (results[i]?.status === 'fulfilled') {
      const tasks = results[i].value?.tasks || results[i].value?.data || [];
      tasks.forEach(task => {
        if (task.gid && !taskIds.has(task.gid)) {
          taskIds.add(task.gid);
          allTasks.push(task);
        }
      });
    }
  }

  // Get Hive Mind activity
  const hiveIndex = results.length - 1;
  const activity = results[hiveIndex]?.status === 'fulfilled' ? (results[hiveIndex].value?.results || []) : [];

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    user: userConfig.name,
    data: {
      calendar: results[0]?.status === 'fulfilled' ? (results[0].value?.events || results[0].value?.value || []) : [],
      emails: allEmails,
      tasks: allTasks,
      activity: activity
    }
  });
}
