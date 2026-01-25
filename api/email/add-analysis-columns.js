// Add AI analysis columns to existing EMAIL_BRIEFING_RESULTS table
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function mcpCall(tool, args = {}) {
  const res = await fetch(SNOWFLAKE_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: tool, arguments: args },
      id: Date.now()
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.result?.content?.[0];
  if (content?.type === 'text') {
    try {
      const parsed = JSON.parse(content.text);
      if (!parsed.success) {
        throw new Error(parsed.error || 'Unknown error');
      }
      return parsed;
    } catch (parseError) {
      // ALTER TABLE responses from Snowflake may not be JSON
      // Check if it's an error message
      if (content.text.includes('Error:') || content.text.includes('error')) {
        throw new Error(content.text);
      }
      // Otherwise assume success (ALTER TABLE succeeded)
      return { success: true, message: content.text };
    }
  }
  return content;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const columnsToAdd = [
    { name: 'FULL_BODY', type: 'TEXT', description: 'Full email body content' },
    { name: 'AI_SUMMARY', type: 'TEXT', description: 'Comprehensive AI-generated summary' },
    { name: 'ACTION_PLAN', type: 'TEXT', description: 'JSON array of action items' },
    { name: 'RECOMMENDED_RESPONSE', type: 'TEXT', description: 'AI-suggested email reply' }
  ];

  const results = [];

  try {
    console.log('Adding AI analysis columns to EMAIL_BRIEFING_RESULTS table...');

    for (const column of columnsToAdd) {
      try {
        const alterTableSQL = `
          ALTER TABLE SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
          ADD COLUMN ${column.name} ${column.type}
        `;

        await mcpCall('sm_query_snowflake', {
          sql: alterTableSQL
        });

        console.log(`✅ ${column.name} column added successfully`);
        results.push({ column: column.name, status: 'added', description: column.description });
      } catch (alterError) {
        // Column likely already exists
        if (alterError.message.includes('already exists') || alterError.message.includes('duplicate')) {
          console.log(`ℹ️ ${column.name} column already exists`);
          results.push({ column: column.name, status: 'already exists', description: column.description });
        } else {
          throw alterError;
        }
      }
    }

    return res.json({
      success: true,
      message: 'AI analysis columns added to EMAIL_BRIEFING_RESULTS table',
      columns: results,
      note: 'Emails will now be cached with full body and AI analysis for instant loading'
    });

  } catch (error) {
    console.error('❌ Column addition error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
