const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

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
  try {
    const result = await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
      sql: `SELECT EMAIL_ID as "id", SUBJECT as "subject", FROM_NAME as "sender", CATEGORY as "category", PRIORITY as "priority", RECEIVED_AT as "date" FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE PROCESSED = false ORDER BY RECEIVED_AT DESC LIMIT 50`
    });

    const emails = result.data || [];
    const mappedEmails = emails.map(e => ({ ...e, from: e.sender || e.from }));

    return res.json({
      success: true,
      query_result: result,
      emails_count: emails.length,
      mapped_emails_count: mappedEmails.length,
      first_email: mappedEmails[0],
      categories: [...new Set(emails.map(e => e.category))]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
