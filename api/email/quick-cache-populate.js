// Quick cache population - reads recent emails and caches them without full AI processing
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function mcpCall(gateway, tool, args = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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
    if (data.error) throw new Error(data.error.message);

    const content = data.result?.content?.[0];
    if (content?.type === 'text') return JSON.parse(content.text);
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const today = new Date().toISOString().split('T')[0];

    // Read recent unread emails from inbox only (fast)
    console.log('📧 Fetching recent unread emails...');
    const emails = await mcpCall(M365_GATEWAY, 'read_emails', {
      folder: 'inbox',
      unread_only: true,
      top: 50
    });

    if (!emails || !emails.emails || emails.emails.length === 0) {
      return res.json({
        success: true,
        message: 'No new emails to cache',
        count: 0
      });
    }

    // Delete today's old cache
    await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
      sql: `DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE = '${today}'`
    });

    // Insert emails into cache (simple categorization)
    const insertPromises = emails.emails.slice(0, 20).map(async (email) => {
      const sql = `
        INSERT INTO SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS (
          EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
          CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
          FOLDER, MAILBOX, RECEIVED_AT, PROCESSED_AT, BRIEFING_DATE
        ) VALUES (
          '${email.id.replace(/'/g, "''")}',
          '${(email.subject || '').replace(/'/g, "''")}',
          '${(email.from || '').replace(/'/g, "''")}',
          '${(email.from || '').replace(/'/g, "''")}',
          '${(email.preview || '').replace(/'/g, "''")}',
          'Unread',
          'Medium',
          true,
          false,
          'Inbox',
          'jstewart@middleground.com',
          '${email.date || new Date().toISOString()}',
          '${new Date().toISOString()}',
          '${today}'
        )
      `;

      return mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql });
    });

    await Promise.all(insertPromises);

    return res.json({
      success: true,
      message: `Cached ${emails.emails.length} emails`,
      count: emails.emails.length
    });

  } catch (error) {
    console.error('Cache population error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
