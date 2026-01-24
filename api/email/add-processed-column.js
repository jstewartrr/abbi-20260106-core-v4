// Add PROCESSED column to existing EMAIL_BRIEFING_RESULTS table
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
    const parsed = JSON.parse(content.text);
    if (!parsed.success) {
      throw new Error(parsed.error || 'Unknown error');
    }
    return parsed;
  }
  return content;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('Adding PROCESSED column to EMAIL_BRIEFING_RESULTS table...');

    // Add PROCESSED column if it doesn't exist
    const alterTableSQL = `
      ALTER TABLE SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
      ADD COLUMN IF NOT EXISTS PROCESSED BOOLEAN DEFAULT false
    `;

    await mcpCall('sm_query_snowflake', {
      sql: alterTableSQL
    });

    console.log('✅ PROCESSED column added successfully');

    return res.json({
      success: true,
      message: 'PROCESSED column added to EMAIL_BRIEFING_RESULTS table',
      note: 'Emails will now track if they have been reviewed'
    });

  } catch (error) {
    console.error('❌ Column addition error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
