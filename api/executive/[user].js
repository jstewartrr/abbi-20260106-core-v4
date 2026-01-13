const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

const USERS = {
  jstewart: { name: 'John Stewart', email: 'jstewart@middleground.com', asana: '373563475019846' },
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

  const results = await Promise.allSettled([
    mcpCall(GATEWAY_URL, 'm365_list_calendar_events', { user: userConfig.email }),
    mcpCall(GATEWAY_URL, 'm365_read_emails', { user: userConfig.email, unread_only: true, top: 10 }),
    userConfig.asana ? mcpCall(GATEWAY_URL, 'asana_search_tasks', { assignee: userConfig.asana, completed: false, due_before: new Date().toISOString().split('T')[0] }) : Promise.resolve({ tasks: [] }),
    mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', { query: "SELECT * FROM SOVEREIGN_MIND.RAW.HIVE_MIND WHERE CREATED_AT > DATEADD(hour, -24, CURRENT_TIMESTAMP()) ORDER BY CREATED_AT DESC LIMIT 5", response_format: 'json' })
  ]);

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    user: userConfig.name,
    data: {
      calendar: results[0].status === 'fulfilled' ? (results[0].value?.events || []) : [],
      emails: results[1].status === 'fulfilled' ? (results[1].value?.emails || []) : [],
      tasks: results[2].status === 'fulfilled' ? results[2].value : { tasks: [] },
      activity: results[3].status === 'fulfilled' ? (results[3].value?.results || []) : []
    }
  });
}
