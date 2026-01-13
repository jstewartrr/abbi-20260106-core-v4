const SNOWFLAKE_URL = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function mcpCall(url, tool, args = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: Date.now() })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const content = data.result?.content?.[0];
  return content?.type === 'text' ? JSON.parse(content.text) : content;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { id, title, model, messages, folder_id } = req.body;
    const session_id = id || `CONV-${Date.now()}`;

    await mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', {
      query: `MERGE INTO SOVEREIGN_MIND.RAW.LIBRECHAT_SESSIONS t
        USING (SELECT '${session_id}' as SESSION_ID) s
        ON t.SESSION_ID = s.SESSION_ID
        WHEN MATCHED THEN UPDATE SET
          TITLE = '${(title || '').replace(/'/g, "''")}',
          MODEL = '${model || 'claude-sonnet-4'}',
          UPDATED_AT = CURRENT_TIMESTAMP(),
          FOLDER_ID = ${folder_id ? `'${folder_id}'` : 'NULL'}
        WHEN NOT MATCHED THEN INSERT (SESSION_ID, TITLE, MODEL, CREATED_AT, UPDATED_AT, FOLDER_ID)
        VALUES ('${session_id}', '${(title || '').replace(/'/g, "''")}', '${model || 'claude-sonnet-4'}', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), ${folder_id ? `'${folder_id}'` : 'NULL'})`,
      response_format: 'json'
    });

    return res.json({
      success: true,
      conversation_id: session_id
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
