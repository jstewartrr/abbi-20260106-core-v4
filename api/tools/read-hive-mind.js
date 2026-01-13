// ElevenLabs Custom Tool: Read recent Hive Mind entries
// Returns recent entries from Hive Mind for ABBI context

const MCP_ENDPOINT = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 5 } = req.body;

    // Query Hive Mind for recent entries
    const sql = `SELECT
      ID,
      CATEGORY,
      SOURCE,
      SUMMARY,
      PRIORITY,
      WORKSTREAM,
      CREATED_AT
    FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
    ORDER BY CREATED_AT DESC
    LIMIT ${Math.min(limit, 20)}`;

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
      const entries = data.result.data.map(entry => ({
        id: entry.ID,
        category: entry.CATEGORY,
        source: entry.SOURCE,
        summary: entry.SUMMARY,
        priority: entry.PRIORITY,
        workstream: entry.WORKSTREAM,
        created_at: entry.CREATED_AT
      }));

      return res.json({
        success: true,
        count: entries.length,
        entries: entries,
        message: `Found ${entries.length} recent Hive Mind entries`
      });
    }

    // Try fallback to RAW.HIVE_MIND if ENTRIES is empty
    const fallbackSql = `SELECT
      ID,
      CATEGORY,
      SOURCE,
      SUMMARY,
      PRIORITY,
      WORKSTREAM,
      CREATED_AT
    FROM SOVEREIGN_MIND.RAW.HIVE_MIND
    ORDER BY CREATED_AT DESC
    LIMIT ${Math.min(limit, 20)}`;

    const fallbackResponse = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sm_query_snowflake',
          arguments: { sql: fallbackSql }
        }
      })
    });

    const fallbackData = await fallbackResponse.json();

    if (fallbackData.result && fallbackData.result.success && fallbackData.result.data) {
      const entries = fallbackData.result.data.map(entry => ({
        id: entry.ID,
        category: entry.CATEGORY,
        source: entry.SOURCE,
        summary: entry.SUMMARY,
        priority: entry.PRIORITY,
        workstream: entry.WORKSTREAM,
        created_at: entry.CREATED_AT
      }));

      return res.json({
        success: true,
        count: entries.length,
        entries: entries,
        message: `Found ${entries.length} recent Hive Mind entries`
      });
    }

    return res.json({
      success: true,
      count: 0,
      entries: [],
      message: 'No Hive Mind entries found'
    });

  } catch (error) {
    console.error('Read Hive Mind error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to read Hive Mind entries'
    });
  }
}
