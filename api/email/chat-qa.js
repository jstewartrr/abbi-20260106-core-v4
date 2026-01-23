// ABBI Chat Q&A - Answer questions about emails with full context
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
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${responseText.substring(0, 200)}`);

    const data = JSON.parse(responseText);
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      try {
        const parsed = JSON.parse(content.text);
        return parsed;
      } catch (jsonErr) {
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
    const { question, message_id, user, chat_history, email_context, context } = req.body;

    console.log(`💬 Chat Q&A - Question: ${question?.substring(0, 100)}`);
    console.log(`📧 Email context: ${message_id ? 'Yes' : 'No'}`);

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Missing question parameter'
      });
    }

    // Build context for AI
    let emailData = null;
    let contextText = '';

    // If we have email context from the frontend, use it
    if (email_context) {
      contextText = `Email Context:
From: ${email_context.from || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Summary: ${email_context.comprehensive_summary || 'No summary available'}

${email_context.body ? 'Full Email Body:\n' + email_context.body.substring(0, 2000) : ''}`;
    }
    // Otherwise, fetch the email if message_id is provided
    else if (message_id && user) {
      console.log('📬 Fetching email from M365...');
      try {
        emailData = await mcpCall('m365_get_email', {
          message_id: message_id,
          user: user
        }, 20000);

        if (emailData) {
          const bodyText = (emailData.body || emailData.bodyPreview || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);

          contextText = `Email Context:
From: ${emailData.from || 'Unknown'}
Subject: ${emailData.subject || 'No subject'}

Email Body:
${bodyText}`;
        }
      } catch (emailError) {
        console.warn('Failed to fetch email:', emailError.message);
        contextText = 'Email context unavailable - answering based on general knowledge.';
      }
    }

    // Add dashboard context if provided
    if (context) {
      if (context.view) {
        contextText += `\n\nCurrent Dashboard View: ${context.view}`;
      }
      if (context.totalEmails) {
        contextText += `\nTotal Emails: ${context.totalEmails}`;
      }
    }

    // Build conversation history
    const conversationHistory = [];
    if (chat_history && Array.isArray(chat_history)) {
      chat_history.forEach(msg => {
        conversationHistory.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    // Add current question with context
    let userPrompt = question;
    if (contextText) {
      userPrompt = `${contextText}

User Question: ${question}`;
    }

    conversationHistory.push({
      role: 'user',
      content: userPrompt
    });

    // Call Claude AI
    console.log('🤖 Calling Claude AI...');
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'AI service not configured. Please check environment variables.'
      });
    }

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
          max_tokens: 2048,
          temperature: 0.5,
          system: `You are ABBI, an AI executive assistant for John Stewart, Managing Partner at Middleground Capital (a private equity firm).

You help John understand his emails, answer questions, and provide insights. Be concise, professional, and action-oriented.

When answering questions:
- Reference specific details from the email context when available
- Highlight important people, companies, dates, or action items
- Provide clear, direct answers
- Suggest next steps when appropriate`,
          messages: conversationHistory
        }),
        signal: aiController.signal
      });

      clearTimeout(aiTimeoutId);

      if (!aiRes.ok) {
        const errorText = await aiRes.text();
        console.error(`AI API error ${aiRes.status}:`, errorText);
        throw new Error(`AI API returned ${aiRes.status}: ${errorText.substring(0, 200)}`);
      }

      const aiData = await aiRes.json();
      const answer = aiData.content[0].text.trim();

      console.log('✅ Chat response generated');

      return res.json({
        success: true,
        answer: answer,
        has_email_context: !!(email_context || emailData)
      });

    } catch (aiError) {
      console.error('AI error:', aiError.message);
      console.error('AI error stack:', aiError.stack);
      return res.status(500).json({
        success: false,
        error: `AI service error: ${aiError.message}`
      });
    }

  } catch (error) {
    console.error('❌ Chat Q&A error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat question'
    });
  }
}
