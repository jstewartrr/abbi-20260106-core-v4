// Simplified Snowflake query for ElevenLabs - returns concise text responses
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
    const { sql } = req.body;

    if (!sql) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: sql'
      });
    }

    // Call Snowflake MCP
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'query_snowflake',
          arguments: { sql }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      return res.json({
        success: false,
        message: `Query error: ${data.error.message || 'Unknown error'}`
      });
    }

    if (data.result) {
      const resultText = data.result.content[0].text;
      const parsed = JSON.parse(resultText);

      if (!parsed.success) {
        return res.json({
          success: false,
          message: `Query failed: ${parsed.error || 'Unknown error'}`
        });
      }

      const rows = parsed.data || [];
      const rowCount = rows.length;

      // Limit to first 5 rows to keep response small
      const limitedRows = rows.slice(0, 5);

      // Format as simple text for voice
      let message = `Query returned ${rowCount} row${rowCount !== 1 ? 's' : ''}.`;

      if (rowCount > 0) {
        // Create concise summary
        const firstRow = limitedRows[0];
        const columns = Object.keys(firstRow);

        if (rowCount === 1) {
          // Single row - return values
          message += ' ' + columns.map(col => `${col}: ${firstRow[col]}`).join(', ');
        } else {
          // Multiple rows - return compact summary
          message += ` Columns: ${columns.join(', ')}.`;
          if (rowCount > 5) {
            message += ` Showing first 5 rows.`;
          }
        }
      }

      // Return ONLY message for voice - no data arrays
      return res.json({
        success: true,
        message: message
      });
    }

    return res.json({
      success: false,
      message: 'Unexpected response from database'
    });

  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({
      success: false,
      message: `Database query failed: ${error.message}`
    });
  }
}
