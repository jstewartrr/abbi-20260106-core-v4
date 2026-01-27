// Mark email as processed (reviewed) in Snowflake cache
const SNOWFLAKE_GATEWAY = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60,
};

async function mcpCall(gateway, tool, args = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
      if (!parsed.success && parsed.error) throw new Error(parsed.error);
      return parsed;
    }
    return content;
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
    const { email_id } = req.body;

    if (!email_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing email_id parameter'
      });
    }

    console.log(`✓ Marking email ${email_id} as processed in HIVE_MIND`);

    // Update email in HIVE_MIND to add processed flag
    // We update the DETAILS JSON to add processed: true
    const sql = `
      UPDATE SOVEREIGN_MIND.HIVE_MIND.ENTRIES
      SET DETAILS = OBJECT_INSERT(DETAILS, 'processed', TRUE, TRUE),
          UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE CATEGORY = 'triaged_email'
        AND DETAILS:email_id::string = '${email_id.replace(/'/g, "''")}'
    `;

    console.log('SQL:', sql);

    const result = await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql });

    console.log('✅ Email marked as processed in HIVE_MIND');

    return res.json({
      success: true,
      message: 'Email marked as processed',
      result: result
    });

  } catch (error) {
    console.error('❌ Mark processed error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark email as processed'
    });
  }
}
