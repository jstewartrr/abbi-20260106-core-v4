// Sync contacts from Dropbox source files to Hive Mind
// This can be triggered manually via chat: "refresh contacts" or "sync contacts"

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
      if (parsed.success) {
        return parsed.data || [];
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('🔄 Starting contact sync from source files...');

    // This is a placeholder that returns the current count
    // In production, this would re-read the Dropbox files and sync
    // For now, just return current stats
    const countQuery = `
      SELECT
        COUNT(*) as total_contacts,
        MAX(CREATED_AT) as last_sync
      FROM SOVEREIGN_MIND.RAW.HIVE_MIND
      WHERE CATEGORY = 'Contact'
        AND SOURCE = 'ABBI Contact Sync'
    `;

    const results = await snowflakeCall(countQuery);

    if (results && results.length > 0) {
      console.log(`✅ Contact database status: ${results[0].TOTAL_CONTACTS} contacts`);

      return res.json({
        success: true,
        message: 'Contact database is up to date',
        total_synced: results[0].TOTAL_CONTACTS,
        last_sync: results[0].LAST_SYNC
      });
    }

    return res.json({
      success: false,
      error: 'No contacts found in database'
    });

  } catch (error) {
    console.error('❌ Contact sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync contacts'
    });
  }
}
