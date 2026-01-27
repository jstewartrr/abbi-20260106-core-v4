// API to fetch full email content from Snowflake RAW.EMAILS table
const SNOWFLAKE_GATEWAY = 'https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message_id, user } = req.body;

  if (!message_id || !user) {
    return res.status(400).json({ error: 'message_id and user required' });
  }

  try {
    // Fetch from Snowflake RAW.EMAILS table where Make.com stores emails
    const escapedMessageId = message_id.replace(/'/g, "''");

    const response = await fetch(SNOWFLAKE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'sm_query_snowflake',
          arguments: {
            sql: `SELECT BODY_CONTENT, BODY_PREVIEW, SUBJECT, SENDER, RECEIVED_AT
                  FROM SOVEREIGN_MIND.RAW.EMAILS
                  WHERE OUTLOOK_MESSAGE_ID = '${escapedMessageId}'
                  LIMIT 1`
          }
        },
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Snowflake error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.result?.content?.[0];

    if (!content || content.type !== 'text') {
      throw new Error('Invalid Snowflake response');
    }

    const results = JSON.parse(content.text);

    if (!results.success || !results.data || results.data.length === 0) {
      throw new Error('Email not found in database');
    }

    const emailData = results.data[0];

    return res.json({
      success: true,
      body: emailData.BODY_CONTENT || emailData.BODY_PREVIEW || 'No email content available',
      bodyPreview: emailData.BODY_PREVIEW,
      subject: emailData.SUBJECT,
      from: emailData.SENDER,
      receivedDateTime: emailData.RECEIVED_AT
    });

  } catch (error) {
    console.error('Error fetching email:', error);
    return res.status(500).json({
      error: 'Failed to fetch email',
      details: error.message
    });
  }
}
