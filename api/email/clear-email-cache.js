// Clear all emails from cache
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function snowflakeCall(sql) {
  const res = await fetch(SNOWFLAKE_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'sm_query_snowflake', arguments: { sql } },
      id: Date.now()
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const content = data.result?.content?.[0];
  if (content?.type === 'text') {
    return JSON.parse(content.text);
  }
  return null;
}

export default async function handler(req, res) {
  try {
    console.log('🗑️ Clearing all emails from cache...');

    const deleteSQL = `DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS`;

    const result = await snowflakeCall(deleteSQL);
    console.log('✅ All emails deleted');

    return res.json({
      success: true,
      message: 'All emails cleared from cache',
      result
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
