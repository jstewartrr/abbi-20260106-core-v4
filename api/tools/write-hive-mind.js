// ElevenLabs Custom Tool: Write to Hive Mind
// Creates a new entry in Hive Mind based on conversation

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
    const { category, summary, priority = 'NORMAL', workstream, source = 'ABBI_VOICE' } = req.body;

    if (!category || !summary) {
      return res.status(400).json({
        success: false,
        error: 'Category and summary are required'
      });
    }

    // Validate category
    const validCategories = ['CHECKPOINT', 'ARTIFACT', 'ANALYSIS', 'DECISION', 'TODO', 'NOTE', 'ERROR'];
    if (!validCategories.includes(category.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // Insert into Hive Mind
    const sql = `INSERT INTO SOVEREIGN_MIND.HIVE_MIND.ENTRIES
      (CATEGORY, SOURCE, SUMMARY, PRIORITY, WORKSTREAM, CREATED_AT)
    VALUES
      ('${category.toUpperCase()}', '${source}', '${summary.replace(/'/g, "''")}', '${priority.toUpperCase()}', ${workstream ? `'${workstream}'` : 'NULL'}, CURRENT_TIMESTAMP())`;

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

    if (data.result && data.result.success) {
      return res.json({
        success: true,
        message: 'Entry added to Hive Mind successfully',
        entry: {
          category: category.toUpperCase(),
          summary: summary,
          priority: priority.toUpperCase(),
          workstream: workstream,
          source: source
        }
      });
    }

    // If INSERT to ENTRIES fails, try RAW.HIVE_MIND
    const fallbackSql = `INSERT INTO SOVEREIGN_MIND.RAW.HIVE_MIND
      (CATEGORY, SOURCE, SUMMARY, PRIORITY, WORKSTREAM, CREATED_AT)
    VALUES
      ('${category.toUpperCase()}', '${source}', '${summary.replace(/'/g, "''")}', '${priority.toUpperCase()}', ${workstream ? `'${workstream}'` : 'NULL'}, CURRENT_TIMESTAMP())`;

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

    if (fallbackData.result && fallbackData.result.success) {
      return res.json({
        success: true,
        message: 'Entry added to Hive Mind successfully',
        entry: {
          category: category.toUpperCase(),
          summary: summary,
          priority: priority.toUpperCase(),
          workstream: workstream,
          source: source
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to write to Hive Mind'
    });

  } catch (error) {
    console.error('Write Hive Mind error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to write to Hive Mind'
    });
  }
}
