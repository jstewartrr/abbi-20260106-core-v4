// One-time API to create EMAIL_BRIEFING_RESULTS table in Snowflake
const SNOWFLAKE_GATEWAY = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

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
    console.log('Creating EMAIL_BRIEFING_RESULTS table...');

    // Create table with 7-day retention
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS (
        EMAIL_ID VARCHAR(500) PRIMARY KEY,
        SUBJECT VARCHAR(1000),
        FROM_NAME VARCHAR(500),
        FROM_EMAIL VARCHAR(500),
        PREVIEW VARCHAR(2000),
        CATEGORY VARCHAR(100),
        PRIORITY VARCHAR(50),
        IS_TO_EMAIL BOOLEAN,
        NEEDS_RESPONSE BOOLEAN,
        FOLDER VARCHAR(500),
        MAILBOX VARCHAR(200),
        TIER INTEGER,
        RECEIVED_AT TIMESTAMP,
        PROCESSED_AT TIMESTAMP,
        BRIEFING_DATE DATE
      )
    `;

    await mcpCall('sm_query_snowflake', {
      sql: createTableSQL
    });

    console.log('✅ Table created successfully');

    return res.json({
      success: true,
      message: 'EMAIL_BRIEFING_RESULTS table created',
      note: 'Data will be kept for 7 days'
    });

  } catch (error) {
    console.error('❌ Table creation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
