const MCP_ENDPOINT = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Query RAW.HIVE_MIND for sessions with metadata
    const sql = `SELECT
      SESSION_ID,
      SOURCE,
      CATEGORY,
      WORKSTREAM,
      SUMMARY,
      CREATED_AT,
      METADATA
    FROM SOVEREIGN_MIND.RAW.HIVE_MIND
    WHERE SESSION_ID IS NOT NULL
      AND CREATED_AT > DATEADD(day, -30, CURRENT_TIMESTAMP())
    GROUP BY SESSION_ID, SOURCE, CATEGORY, WORKSTREAM, SUMMARY, CREATED_AT, METADATA
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
        sessions: sessions.map(s => {
          // Parse metadata for Asana project info
          let asanaProjectId = null;
          let asanaProjectName = null;
          let asanaProjectUrl = null;

          if (s.METADATA) {
            try {
              const metadata = typeof s.METADATA === 'string' ? JSON.parse(s.METADATA) : s.METADATA;
              asanaProjectId = metadata.asana_project_id || metadata.ASANA_PROJECT_ID;
              asanaProjectName = metadata.asana_project_name || metadata.ASANA_PROJECT_NAME;

              // Construct Asana URL from project ID
              if (asanaProjectId) {
                asanaProjectUrl = `https://app.asana.com/0/${asanaProjectId}`;
              }
            } catch (e) {
              // Metadata parse error - ignore
            }
          }

          return {
            id: s.SESSION_ID || 'unknown',
            title: s.WORKSTREAM || s.CATEGORY || 'Session',
            summary: s.SUMMARY || '',
            status: 'active',
            created_at: s.CREATED_AT,
            source: s.SOURCE || 'Claude',
            asana_project_id: asanaProjectId,
            asana_project_name: asanaProjectName,
            asana_project_url: asanaProjectUrl
          };
        })
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
