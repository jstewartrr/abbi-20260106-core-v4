const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

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

  // Fetch emails from triage cache in Snowflake (not directly from M365)
  const emailPromises = [
    mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
      sql: `SELECT
        EMAIL_ID as "id",
        SUBJECT as "subject",
        FROM_NAME as "sender",
        FROM_EMAIL as "from_email",
        CATEGORY as "category",
        PRIORITY as "priority",
        RECEIVED_AT as "date",
        PREVIEW as "preview",
        FULL_BODY as "full_body",
        AI_SUMMARY as "ai_summary",
        ACTION_PLAN as "action_plan",
        RECOMMENDED_RESPONSE as "recommended_response",
        IS_TO_EMAIL as "is_to_email",
        NEEDS_RESPONSE as "needs_response",
        FOLDER as "folder",
        MAILBOX as "mailbox"
      FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
      WHERE PROCESSED = false
      ORDER BY RECEIVED_AT DESC
      LIMIT 50`
    }).then(result => {
      console.log('[Executive API] Email query result:', result);
      return { emails: result.data || [] };
    }).catch(err => {
      console.error('[Executive API] Email query error:', err);
      return { emails: [] };
    })
  ];

  // Fetch tasks directly from Asana (not from cache)
  const asanaPromises = userConfig.asanaProjects
    ? [
        // Tasks assigned TO user in MP Project Dashboard
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.mpDashboard, assignee: userConfig.asanaGid }),
        // Tasks assigned TO user in Weekly Items
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.weeklyItems, assignee: userConfig.asanaGid }),
        // All incomplete tasks in MP Dashboard
        mcpCall(GATEWAY_URL, 'asana_list_tasks', { project_id: userConfig.asanaProjects.mpDashboard, completed: false }),
        // All incomplete tasks in Weekly Items
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

  // Get emails from triage cache (single query)
  const allEmails = [];
  const emailStartIndex = 1;
  const emailEndIndex = emailStartIndex + 1;
  console.log('[Executive API] Email result status:', results[emailStartIndex]?.status);
  console.log('[Executive API] Email result value:', results[emailStartIndex]?.value);
  if (results[emailStartIndex]?.status === 'fulfilled') {
    const emails = results[emailStartIndex].value?.emails || [];
    console.log('[Executive API] Extracted emails count:', emails.length);

    // Map cached emails to dashboard format
    const mappedEmails = emails.map(e => {
      // Convert category format: "TO - FYI" -> "To: FYI"
      let dashboardCategory = e.category || '';
      if (dashboardCategory.includes(' - ')) {
        dashboardCategory = dashboardCategory.replace(' - ', ': ').replace(/^(TO|CC)/i, match => match.charAt(0) + match.slice(1).toLowerCase());
      }

      return {
        ...e,
        from: e.sender || e.from,
        categories: ['Processed', dashboardCategory]  // Dashboard expects categories array
      };
    });

    allEmails.push(...mappedEmails);
  } else {
    console.error('[Executive API] Email query was rejected:', results[emailStartIndex]?.reason);
  }

  // Get tasks from Asana API (4 queries: 2 assigned to user, 2 all incomplete)
  const allTasks = [];
  const asanaStartIndex = emailEndIndex;
  const asanaEndIndex = asanaStartIndex + (userConfig.asanaProjects ? 4 : 1);
  const taskIds = new Set();

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
