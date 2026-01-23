// Mark email(s) as read or unread via M365 API
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

async function mcpCall(tool, args = {}, timeoutMs = 15000) {
  const actualToolName = tool.startsWith('m365_') ? tool.substring(5) : tool;
  console.log(`[mcpCall] Calling ${actualToolName} with args:`, JSON.stringify(args));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(M365_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: actualToolName, arguments: args },
        id: Date.now()
      }),
      signal: controller.signal
    });

    const responseText = await res.text();
    console.log(`[mcpCall] Response status: ${res.status}, text length: ${responseText.length}`);
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${responseText.substring(0, 200)}`);

    const data = JSON.parse(responseText);
    if (data.error) {
      console.log(`[mcpCall] ERROR in response:`, data.error);
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const content = data.result?.content?.[0];
    console.log(`[mcpCall] Content type: ${content?.type}`);
    if (content?.type === 'text') {
      console.log(`[mcpCall] Text content length: ${content.text?.length}`);
      try {
        const parsed = JSON.parse(content.text);
        console.log(`[mcpCall] Parsed result keys:`, Object.keys(parsed));
        return parsed;
      } catch (jsonErr) {
        if (content.text.startsWith('Error:') || content.text.includes('error')) {
          throw new Error(content.text);
        }
        return { text: content.text };
      }
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
    const { message_ids, user, is_read } = req.body;
    console.log(`📧 Marking ${message_ids?.length || 0} email(s) as ${is_read ? 'read' : 'unread'} for ${user}`);

    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid message_ids parameter (must be array)'
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Missing user parameter'
      });
    }

    // Mark emails as read/unread via M365 MCP
    console.log('📬 Marking emails via M365...');
    const result = await mcpCall('m365_mark_read', {
      message_ids: message_ids,
      user: user,
      is_read: is_read !== false // Default to true if not specified
    }, 20000);

    console.log('✅ Emails marked successfully');

    return res.json({
      success: true,
      message_ids: message_ids,
      is_read: is_read !== false,
      result: result
    });

  } catch (error) {
    console.error('❌ Mark read error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark emails as read'
    });
  }
}
