const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

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

  const { type, limit } = req.query;

  try {
    if (type === 'stats') {
      const result = await mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', {
        query: `SELECT
          COUNT(*) as total_entries,
          COUNT(DISTINCT SESSION_ID) as total_sessions,
          MAX(CREATED_AT) as last_update,
          COUNT(CASE WHEN CREATED_AT > DATEADD(hour, -24, CURRENT_TIMESTAMP()) THEN 1 END) as entries_24h
        FROM SOVEREIGN_MIND.RAW.HIVE_MIND`,
        response_format: 'json'
      });

      return res.json({
        success: true,
        data: result.results?.[0] || {}
      });
    }

    if (type === 'entries') {
      const entryLimit = parseInt(limit) || 10;
      const result = await mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', {
        query: `SELECT
          CREATED_AT,
          SOURCE,
          CATEGORY,
          WORKSTREAM,
          SUMMARY,
          PRIORITY
        FROM SOVEREIGN_MIND.RAW.HIVE_MIND
        ORDER BY CREATED_AT DESC
        LIMIT ${entryLimit}`,
        response_format: 'json'
      });

      return res.json({
        success: true,
        data: result.results || []
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid type parameter' });
  } catch (error) {
    console.error('Hive Mind API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
