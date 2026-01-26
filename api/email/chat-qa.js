// ABBI Chat Q&A - Simplified with essential tools only
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60,
};

// Essential tools - defined outside handler for faster initialization
const TOOLS = [
  {
    name: 'm365_send_email',
    description: 'Send a new email from John Stewart (jstewart@middleground.com)',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (HTML or plain text)' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients (optional)' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'm365_reply_email',
    description: 'Reply to an email. Can add CC/To recipients.',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'ID of email to reply to (from EMAIL CONTEXT)' },
        body: { type: 'string', description: 'Reply body text' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients to add (optional)' },
        to: { type: 'array', items: { type: 'string' }, description: 'Additional To recipients (optional)' },
        reply_all: { type: 'boolean', description: 'Reply to all original recipients (optional)' }
      },
      required: ['message_id', 'body']
    }
  },
  {
    name: 'm365_forward_email',
    description: 'Forward an email to new recipients',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'ID of email to forward (from EMAIL CONTEXT)' },
        to: { type: 'array', items: { type: 'string' }, description: 'New recipient email addresses' },
        comment: { type: 'string', description: 'Your message to add (optional)' }
      },
      required: ['message_id', 'to']
    }
  }
];

const SYSTEM_PROMPT = `You are ABBI, AI assistant for John Stewart, Managing Partner at Middleground Capital.

**TOOLS AVAILABLE:**
- m365_send_email: Send new email
- m365_reply_email: Reply to email (can add CC/To recipients, use reply_all)
- m365_forward_email: Forward email

**EMAIL CONTEXT:** When viewing an email, you receive Message ID, From, To, Subject, Body.

**ACTION COMMANDS** (reply, send, forward):
1. Draft the content
2. IMMEDIATELY USE THE TOOL
3. Report: "✓ Sent/Replied" or "❌ Failed: [error]"

**QUESTIONS** (what should I say, analyze):
- Provide recommendations
- DON'T use tools unless explicitly told to execute

**EMAIL FORMAT** (CRITICAL):
ALL emails MUST be professional business format:
- Greeting: "Hi [Name]," or "Dear [Name],"
- Clear paragraphs (2-4 sentences)
- Closing: "Best regards," or "Thank you,"
- Signature: "John" or "John Stewart"
- Professional tone - NO slang or emojis

Example:
Hi [Name],

[Purpose statement]

[Details]

Best regards,
John

John's email: jstewart@middleground.com`;

// MCP tool call helper
async function mcpCall(tool, args = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(M365_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now()
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`MCP error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const result = data.result?.content?.[0]?.text || JSON.stringify(data.result);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`Tool timeout after 15s`);
    throw error;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { question, email_context, context, conversation_history } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Missing question' });
    }

    // Build context
    let fullPrompt = question;
    if (email_context) {
      const message_id = email_context.email_id || email_context.message_id;
      fullPrompt = `EMAIL CONTEXT:
Message ID: ${message_id || 'Unknown'}
From: ${email_context.from || 'Unknown'}
To: ${email_context.to || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Body: ${email_context.body || email_context.preview || 'No content'}

---
User Question: ${question}`;
    }

    // Build messages
    let messages = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      messages = conversation_history;
    }
    messages.push({ role: 'user', content: fullPrompt });

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: messages,
        tools: TOOLS,
        system: SYSTEM_PROMPT
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Check if Claude wants to use a tool
    if (data.stop_reason === 'tool_use') {
      const toolUse = data.content.find(block => block.type === 'tool_use');

      if (toolUse) {
        let toolResult;
        let toolError = null;

        try {
          const toolInput = { ...toolUse.input };
          if (toolUse.name.startsWith('m365_')) {
            toolInput.user = 'jstewart@middleground.com';
          }

          toolResult = await mcpCall(toolUse.name, toolInput);
        } catch (toolErr) {
          toolError = `Tool failed: ${toolErr.message}`;
          toolResult = toolError;
        }

        // Send tool result back to Claude
        messages.push({ role: 'assistant', content: data.content });
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResult,
            is_error: !!toolError
          }]
        });

        // Get final response
        const response2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: messages,
            tools: TOOLS,
            system: SYSTEM_PROMPT
          })
        });

        if (!response2.ok) {
          const errorText = await response2.text();
          throw new Error(`Claude API error: ${response2.status}`);
        }

        const data2 = await response2.json();
        const answer = data2.content.find(block => block.type === 'text')?.text || 'Tool executed';

        return res.json({ success: true, answer: answer });
      }
    }

    // No tool use - return text response
    const answer = data.content.find(block => block.type === 'text')?.text || data.content[0].text;
    return res.json({ success: true, answer: answer });

  } catch (error) {
    console.error('❌ Chat error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Chat failed'
    });
  }
}
