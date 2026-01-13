// ElevenLabs Custom Tool: Search Hive Mind by keyword or category
// Searches Hive Mind entries based on user query

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
    const { query, category, limit = 10 } = req.body;

    if (!query && !category) {
      return res.status(400).json({
        success: false,
        error: 'Either query or category is required'
      });
    }

    // Build SQL query based on search parameters
    let sql = `SELECT
      ID,
      CATEGORY,
      SOURCE,
      SUMMARY,
      PRIORITY,
      WORKSTREAM,
      CREATED_AT
    FROM SOVEREIGN_MIND.RAW.HIVE_MIND
    WHERE 1=1`;

    if (query) {
      sql += ` AND (SUMMARY ILIKE '%${query}%' OR WORKSTREAM ILIKE '%${query}%' OR CATEGORY ILIKE '%${query}%')`;
    }

    if (category) {
      sql += ` AND CATEGORY = '${category}'`;
    }

    sql += ` ORDER BY CREATED_AT DESC LIMIT ${Math.min(limit, 20)}`;

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
        query: query,
        category: category,
        message: `Found ${entries.length} matching entries`
      });
    }

    return res.json({
      success: true,
      count: 0,
      entries: [],
      query: query,
      category: category,
      message: 'No matching entries found'
    });

  } catch (error) {
    console.error('Search Hive Mind error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to search Hive Mind'
    });
  }
}
