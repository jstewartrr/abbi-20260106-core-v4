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

  try {
    const result = await mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', {
      query: `SELECT
        SESSION_ID,
        SOURCE,
        CATEGORY,
        WORKSTREAM,
        CREATED_AT,
        COUNT(*) as entry_count
      FROM SOVEREIGN_MIND.RAW.HIVE_MIND
      WHERE SESSION_ID IS NOT NULL
        AND CREATED_AT > DATEADD(day, -7, CURRENT_TIMESTAMP())
      GROUP BY SESSION_ID, SOURCE, CATEGORY, WORKSTREAM, CREATED_AT
      ORDER BY CREATED_AT DESC
      LIMIT 20`,
      response_format: 'json'
    });

    const sessions = result.results || [];

    return res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.SESSION_ID || 'unknown',
        title: s.WORKSTREAM || s.CATEGORY || 'Session',
        status: 'completed',
        created_at: s.CREATED_AT,
        entry_count: s.entry_count || 0
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
