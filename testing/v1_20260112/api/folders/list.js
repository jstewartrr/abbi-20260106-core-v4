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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const result = await mcpCall(SNOWFLAKE_URL, 'snowflake_execute_query', {
      query: `SELECT
        FOLDER_ID as id,
        FOLDER_NAME as name,
        CREATED_AT as created_at
      FROM SOVEREIGN_MIND.RAW.SESSION_FOLDERS
      ORDER BY FOLDER_NAME`,
      response_format: 'json'
    });

    return res.json({
      success: true,
      folders: result.results || []
    });
  } catch (error) {
    return res.json({ success: true, folders: [] });
  }
}
