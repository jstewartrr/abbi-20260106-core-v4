// Setup Snowflake table for Asana task analysis
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('Creating ASANA_TASK_ANALYSIS table...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS (
        TASK_GID VARCHAR(100) PRIMARY KEY,
        TASK_NAME VARCHAR(5000),
        ASSIGNEE_NAME VARCHAR(500),
        DUE_DATE DATE,
        CATEGORY VARCHAR(100),
        SECTION VARCHAR(500),
        COMPLETED BOOLEAN,
        AI_SUMMARY VARCHAR(5000),
        DRAFT_COMMENT VARCHAR(5000),
        ACTION_PLAN VARCHAR(5000),
        PRIORITY_ASSESSMENT VARCHAR(1000),
        BLOCKERS VARCHAR(5000),
        PERMALINK_URL VARCHAR(1000),
        PROCESSED_AT TIMESTAMP_NTZ,
        CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
      )
    `;

    const result = await snowflakeCall(createTableSQL);
    console.log('✅ Table created successfully');

    return res.json({
      success: true,
      message: 'ASANA_TASK_ANALYSIS table created',
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
