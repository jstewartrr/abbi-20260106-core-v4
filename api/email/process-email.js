// Process individual email - fetch full details and AI analysis
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
    const { email_id, user } = req.body;
    console.log(`📧 Processing email: ${email_id} for ${user}`);

    if (!email_id || !user) {
      return res.status(400).json({
        success: false,
        error: 'Missing email_id or user parameter'
      });
    }

    // Fetch full email from M365
    console.log('📬 Fetching full email from M365...');
    const emailData = await mcpCall('m365_get_email', {
      message_id: email_id,
      user: user
    }, 20000);

    if (!emailData) {
      throw new Error('Failed to fetch email from M365');
    }

    console.log('✅ Email fetched:', {
      subject: emailData.subject?.substring(0, 50),
      from: emailData.from,
      to: emailData.to,
      cc: emailData.cc,
      hasBody: !!emailData.body
    });

    // Extract email content and recipients
    const subject = emailData.subject || 'No subject';
    const from = emailData.from || 'Unknown';
    const to = emailData.to || [];
    const cc = emailData.cc || [];
    const received = emailData.date || emailData.receivedDateTime || '';

    // Get body - prefer plain text, fallback to HTML stripped of tags
    let body = emailData.body || emailData.bodyPreview || '';

    // Strip HTML tags for AI analysis
    const bodyForAI = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Generate AI analysis
    console.log('🤖 Generating AI analysis...');
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const aiPrompt = `You are an executive assistant for John Stewart, Managing Partner at Middleground Capital (a private equity firm).

Analyze this email and provide:
1. A comprehensive executive summary (2-3 sentences) that captures the key points, context, and any required actions
2. Identify any time-sensitive items or deadlines
3. Note any key people, companies, or deals mentioned

Email:
From: ${from}
Subject: ${subject}

${bodyForAI}

Provide ONLY the comprehensive summary in plain text. Be concise but thorough. Focus on what John needs to know and do.`;

    const aiController = new AbortController();
    const aiTimeoutId = setTimeout(() => aiController.abort(), 30000);

    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          temperature: 0.3,
          messages: [{ role: 'user', content: aiPrompt }]
        }),
        signal: aiController.signal
      });

      clearTimeout(aiTimeoutId);

      if (!aiRes.ok) {
        throw new Error(`AI API returned ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const comprehensive_summary = aiData.content[0].text.trim();

      console.log('✅ AI analysis complete');

      return res.json({
        success: true,
        email_id: email_id,
        subject: subject,
        from: from,
        to: to,
        cc: cc,
        received: received,
        body: body,
        comprehensive_summary: comprehensive_summary
      });

    } catch (aiError) {
      console.error('AI analysis failed:', aiError.message);
      // Return email without AI analysis
      return res.json({
        success: true,
        email_id: email_id,
        subject: subject,
        from: from,
        to: to,
        cc: cc,
        received: received,
        body: body,
        comprehensive_summary: 'AI analysis unavailable - please review the email body below.'
      });
    }

  } catch (error) {
    console.error('❌ Process email error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process email'
    });
  }
}
