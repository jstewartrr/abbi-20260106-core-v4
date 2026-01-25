// Clear junk/automated emails from Snowflake cache

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
    console.log('🗑️ Clearing junk emails from cache...');

    const deleteSQL = `
      DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
      WHERE FROM_EMAIL LIKE '%dealcloud.com'
         OR FROM_EMAIL LIKE '%microsoft.com'
         OR FROM_EMAIL LIKE '%azure%'
         OR FROM_EMAIL LIKE '%asana.com'
         OR FROM_EMAIL LIKE '%aws%'
         OR FROM_EMAIL LIKE '%no-reply%'
         OR FROM_EMAIL LIKE '%noreply%'
         OR SUBJECT LIKE 'Undeliverable:%'
         OR SUBJECT LIKE 'Canceled:%'
         OR SUBJECT LIKE 'We noticed a new login%'
         OR SUBJECT LIKE 'Verify your%'
         OR SUBJECT LIKE 'Get started with%'
         OR SUBJECT LIKE '%Daily Interaction Summary%'
         OR SUBJECT LIKE '%Deals Added Today%'
    `;

    const result = await snowflakeCall(deleteSQL);
    console.log('✅ Junk emails deleted');

    return res.json({
      success: true,
      message: 'Junk emails cleared from cache',
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
