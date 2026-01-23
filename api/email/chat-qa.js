// ABBI Chat Q&A - Clean rebuild v8.92
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

// MCP tool call helper with timeout
async function mcpCall(tool, args = {}) {
  const actualToolName = tool.startsWith('m365_') ? tool.substring(5) : tool;
  console.log(`🔧 [mcpCall] Calling ${actualToolName} with args:`, JSON.stringify(args).substring(0, 200));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

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

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [mcpCall] MCP HTTP error ${res.status}:`, errorText);
      throw new Error(`MCP call failed: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    if (data.error) {
      console.error(`❌ [mcpCall] MCP returned error:`, data.error);
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const result = data.result?.content?.[0]?.text || JSON.stringify(data.result);
    console.log(`✅ [mcpCall] Success:`, result.substring(0, 200));
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`⏱️ [mcpCall] Timeout after 15 seconds`);
      throw new Error(`Tool execution timed out after 15 seconds`);
    }
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
      return res.status(400).json({
        success: false,
        error: 'Missing question parameter'
      });
    }

    console.log(`💬 Chat Q&A - Question: ${question?.substring(0, 100)}`);
    console.log(`📧 Email context: ${email_context ? 'Yes' : 'No'}`);
    console.log(`📧 Message ID: ${email_context?.email_id || email_context?.message_id || 'Not provided'}`);

    // Build context for AI
    let fullPrompt = question;

    if (email_context) {
      const message_id = email_context.email_id || email_context.message_id;
      const emailData = `
EMAIL CONTEXT:
Message ID: ${message_id || 'Unknown'}
From: ${email_context.from || 'Unknown'}
To: ${email_context.to || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Received: ${email_context.received || 'Unknown'}
Preview: ${email_context.preview || ''}

Full Email Body:
${email_context.body || email_context.preview || 'No content available'}

---

User Question: ${question}`;

      fullPrompt = emailData;
    }

    // Build messages array with conversation history
    let messages = [];

    // Add previous conversation turns if provided
    if (conversation_history && Array.isArray(conversation_history)) {
      messages = conversation_history;
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: fullPrompt
    });

    console.log(`💬 Sending ${messages.length} messages to Claude (including history)`);

    // Define M365 tools for ABBI
    const tools = [
      {
        name: 'm365_send_email',
        description: 'Send an email from John Stewart\'s account (jstewart@middleground.com)',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body (HTML or plain text)' },
            cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients (optional)' },
            importance: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Email importance (optional)' }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'm365_reply_email',
        description: 'Reply to an email',
        input_schema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'ID of the email to reply to' },
            body: { type: 'string', description: 'Reply body text' },
            reply_all: { type: 'boolean', description: 'Reply to all recipients (default: false)' }
          },
          required: ['message_id', 'body']
        }
      }
    ];

    // Call Claude API with tools
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: messages,
        tools: tools,
        system: 'You are ABBI, John Stewart\'s AI executive assistant at Middleground Capital.\n\nCAPABILITIES:\n- Analyze emails and provide recommendations\n- Draft email responses\n- **SEND emails directly** using m365_send_email (new emails) or m365_reply_email (replies)\n- Answer questions about emails and provide context\n- Remember previous conversation history\n\nAVAILABLE CONTEXT:\n- When viewing an email, you receive the **Message ID** in the EMAIL CONTEXT section\n- This Message ID is what you need for the m365_reply_email tool (as the message_id parameter)\n- You also have from, to, subject, and body of the email\n\nWHEN USER ASKS TO SEND/REPLY:\n1. Draft the email content FIRST and show it to John\n2. Ask for confirmation: "Would you like me to send this?"\n3. After John confirms, USE THE TOOL to actually send/reply\n4. For replies: Use m365_reply_email with the message_id from EMAIL CONTEXT\n5. For new emails: Use m365_send_email with recipient addresses\n6. Report success clearly: "✓ Email sent successfully"\n\n**IMPORTANT**: You CAN and SHOULD actually send emails when John confirms. Don\'t say "I can\'t send emails" - you have the tools and authority to do so.\n\nRESPONSE FORMAT:\nFor email analysis:\n1) Recommended response - Whether to reply and suggested tone/content\n2) Key action items - Specific tasks to complete\n3) Deadlines & time-sensitive matters - Any urgent items\n\nBe direct, concise, and professional.'
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
        console.log(`🔧 Tool use requested: ${toolUse.name}`);
        console.log(`🔧 Tool input:`, JSON.stringify(toolUse.input).substring(0, 300));

        let toolResult;
        let toolError = null;

        // Execute the tool with error handling
        try {
          toolResult = await mcpCall(toolUse.name, toolUse.input);
          console.log(`✅ Tool executed successfully`);
        } catch (toolErr) {
          console.error(`❌ Tool execution failed:`, toolErr.message);
          toolError = `Tool execution failed: ${toolErr.message}`;
          toolResult = toolError;
        }

        // Send tool result back to Claude
        messages.push({
          role: 'assistant',
          content: data.content
        });

        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResult,
            is_error: !!toolError
          }]
        });

        // Get final response from Claude
        console.log(`🤖 Getting final response from Claude after tool execution...`);
        const response2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: messages,
            tools: tools,
            system: 'You are ABBI, John Stewart\'s AI executive assistant at Middleground Capital.\n\nCAPABILITIES:\n- Analyze emails and provide recommendations  \n- Draft email responses\n- **SEND emails directly** using m365_send_email (new emails) or m365_reply_email (replies)\n- Answer questions about emails and provide context\n- Remember previous conversation history\n\nAVAILABLE CONTEXT:\n- When viewing an email, you receive the **Message ID** in the EMAIL CONTEXT section\n- This Message ID is what you need for the m365_reply_email tool (as the message_id parameter)\n- You also have from, to, subject, and body of the email\n\nWHEN USER ASKS YOU TO TAKE ACTION:\n- If user says "reply and say X" → Draft the reply with content X and USE THE TOOL to send it immediately\n- If user asks "draft a reply" → Show the draft WITHOUT sending\n- Always USE THE TOOLS when user asks you to send/reply\n- For replies: Use m365_reply_email with message_id from EMAIL CONTEXT\n- For new emails: Use m365_send_email with recipient addresses\n- Report tool results clearly: "✓ Email sent successfully" or "❌ Failed to send: [error]"\n\n**IMPORTANT**: You CAN and SHOULD actually send emails when asked. Don\'t just SAY you sent it - actually use the tool.\n\nRESPONSE FORMAT:\nFor email analysis:\n1) Recommended response - Whether to reply and suggested tone/content\n2) Key action items - Specific tasks to complete\n3) Deadlines & time-sensitive matters - Any urgent items\n\nBe direct, concise, and professional.'
          })
        });

        if (!response2.ok) {
          const errorText = await response2.text();
          console.error(`❌ Claude API error on second call:`, errorText);
          throw new Error(`Claude API error: ${response2.status}`);
        }

        const data2 = await response2.json();
        console.log(`✅ Got final response from Claude`);
        const answer = data2.content.find(block => block.type === 'text')?.text || 'Tool executed successfully';

        return res.json({
          success: true,
          answer: answer
        });
      }
    }

    // No tool use - return text response
    const answer = data.content.find(block => block.type === 'text')?.text || data.content[0].text;

    return res.json({
      success: true,
      answer: answer
    });

  } catch (error) {
    console.error('❌ Chat Q&A error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat question'
    });
  }
}
