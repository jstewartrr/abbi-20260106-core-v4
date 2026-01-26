const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

const USERS = {
  jstewart: {
    name: 'John Stewart',
    email: 'jstewart@middleground.com',
    emailAccounts: ['jstewart@middleground.com', 'john@middleground.com'],
    asanaGid: '373563475019846',
    asanaProjects: {
      mpDashboard: '1204554210439476',    // MP Project Dashboard
      weeklyItems: '1212197943409021',    // John's Weekly Items
      dailyBriefing: '1209783905568586'   // MP Daily Briefing
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

  // Fetch triaged emails from Snowflake cache (NOT directly from M365)
  // Triage process runs periodically and caches analyzed emails
  const emailQuery = `
    SELECT
      EMAIL_ID as id,
      SUBJECT as subject,
      FROM_NAME as from_name,
      FROM_EMAIL as from,
      PREVIEW as preview,
      CATEGORY as category,
      PRIORITY as priority,
      RECEIVED_AT as date,
      PROCESSED,
      AI_SUMMARY as ai_summary,
      ACTION_PLAN as action_plan,
      RECOMMENDED_RESPONSE as recommended_response,
      FULL_BODY as body,
      NEEDS_RESPONSE as needs_response,
      IS_TO_EMAIL as is_to_email
    FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
    WHERE PROCESSED = false
    ORDER BY RECEIVED_AT DESC
    LIMIT 100
  `;

  // Fetch tasks assigned to this user across all projects
  const asanaPromises = userConfig.asanaGid
    ? [
        // All incomplete tasks assigned TO this user
        mcpCall(GATEWAY_URL, 'asana_search_tasks', { assignee: userConfig.asanaGid, completed: false })
      ]
    : [Promise.resolve({ tasks: [] })];

  const results = await Promise.allSettled([
    // Calendar from jstewart only
    mcpCall(GATEWAY_URL, 'm365_list_calendar_events', { user: userConfig.email }),
    // Triaged emails from Snowflake cache
    mcpCall(SNOWFLAKE_URL, 'sm_query_snowflake', { sql: emailQuery }),
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

  // Merge Asana tasks from search query
  const allTasks = [];
  const asanaStartIndex = emailEndIndex;
  const asanaEndIndex = asanaStartIndex + (userConfig.asanaGid ? 1 : 1);
  if (results[asanaStartIndex]?.status === 'fulfilled') {
    const tasks = results[asanaStartIndex].value?.tasks || results[asanaStartIndex].value?.data || [];
    allTasks.push(...tasks);
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
