const MCP_ENDPOINT = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Query Hive Mind for sessions with Asana project info
    const sql = `SELECT
      SESSION_ID,
      SOURCE,
      CATEGORY,
      WORKSTREAM,
      SUMMARY,
      CREATED_AT,
      ASANA_PROJECT_ID,
      ASANA_PROJECT_NAME,
      ASANA_PROJECT_URL
    FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
    WHERE SESSION_ID IS NOT NULL
    ORDER BY CREATED_AT DESC
    LIMIT 20`;

    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'sm_query_snowflake',
          arguments: { sql }
        }
      })
    });

    const data = await response.json();

    if (data.result && data.result.success && data.result.data) {
      const sessions = data.result.data;

      return res.json({
        success: true,
        sessions: sessions.map(s => ({
          id: s.SESSION_ID || 'unknown',
          title: s.WORKSTREAM || s.CATEGORY || 'Session',
          summary: s.SUMMARY || '',
          status: 'active',
          created_at: s.CREATED_AT,
          source: s.SOURCE || 'Claude',
          asana_project_id: s.ASANA_PROJECT_ID || null,
          asana_project_name: s.ASANA_PROJECT_NAME || null,
          asana_project_url: s.ASANA_PROJECT_URL || null
        }))
      });
    }

    // If no data, return empty sessions
    return res.json({
      success: true,
      sessions: []
    });

  } catch (error) {
    console.error('Sessions API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
