// API to fetch full email content from Outlook
const M365_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message_id, user } = req.body;

  if (!message_id || !user) {
    return res.status(400).json({ error: 'message_id and user required' });
  }

  try {
    // Call M365 MCP to get full email
    const response = await fetch(M365_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'm365_get_email',
          arguments: {
            user_email: user,
            message_id: message_id
          }
        },
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`M365 error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.result?.content?.[0];

    if (!content || content.type !== 'text') {
      throw new Error('Invalid M365 response');
    }

    const emailData = JSON.parse(content.text);

    if (!emailData.success) {
      throw new Error(emailData.error || 'Failed to fetch email');
    }

    return res.json({
      success: true,
      body: emailData.body || emailData.bodyPreview,
      bodyPreview: emailData.bodyPreview,
      subject: emailData.subject,
      from: emailData.from,
      receivedDateTime: emailData.receivedDateTime
    });

  } catch (error) {
    console.error('Error fetching email:', error);
    return res.status(500).json({
      error: 'Failed to fetch email',
      details: error.message
    });
  }
}
