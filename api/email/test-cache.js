// Test cache endpoint - check if emails are in the cache
const SNOWFLAKE_GATEWAY = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function snowflakeCall(query) {
  const res = await fetch(SNOWFLAKE_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'sm_query_snowflake', arguments: { sql: query } },
      id: Date.now()
    })
  });

  if (!res.ok) throw new Error(`Snowflake HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.result?.content?.[0];
  if (content?.type === 'text') {
    const parsed = JSON.parse(content.text);
    return parsed;
  }
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const today = new Date().toISOString().split('T')[0];

    const queries = {
      count: `SELECT COUNT(*) as count FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE = '${today}'`,
      all: `SELECT * FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE = '${today}'`,
      dates: `SELECT DISTINCT BRIEFING_DATE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS ORDER BY BRIEFING_DATE DESC LIMIT 10`
    };

    const results = {
      today_date: today,
      count: await snowflakeCall(queries.count),
      dates: await snowflakeCall(queries.dates),
      emails: await snowflakeCall(queries.all)
    };

    return res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Test cache error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
