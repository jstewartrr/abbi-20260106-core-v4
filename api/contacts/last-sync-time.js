// Get last contact sync timestamp from Hive Mind
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function snowflakeCall(query, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(SNOWFLAKE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'sm_query_snowflake', arguments: { sql: query } },
        id: Date.now()
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Snowflake HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      const parsed = JSON.parse(content.text);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
      if (parsed.success) {
        return [];
      }
      throw new Error(parsed.error || 'Unknown Snowflake error');
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const query = `
      SELECT
        MAX(CREATED_AT) as last_sync,
        COUNT(*) as total_contacts
      FROM SOVEREIGN_MIND.RAW.HIVE_MIND
      WHERE CATEGORY = 'Contact'
        AND SOURCE = 'ABBI Contact Sync'
    `;

    const results = await snowflakeCall(query);

    if (results && results.length > 0) {
      return res.json({
        success: true,
        last_sync: results[0].LAST_SYNC,
        total_contacts: results[0].TOTAL_CONTACTS
      });
    }

    return res.json({
      success: false,
      message: 'No contact sync data found'
    });

  } catch (error) {
    console.error('❌ Last sync time error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get last sync time'
    });
  }
}
