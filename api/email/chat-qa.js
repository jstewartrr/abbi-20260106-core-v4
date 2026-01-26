// ABBI Chat Q&A - v9.8.1 with Claude Haiku for faster responses
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

// Vercel Pro limit is 60 seconds - using Haiku for speed
export const config = {
  maxDuration: 60,
};

// MCP tool call helper with timeout - routes to M365 gateway for all tools
async function mcpCall(tool, args = {}) {
  // M365 gateway expects prefixed tool names (m365_, asana_, etc.)
  const actualToolName = tool;

  console.log(`🔧 [mcpCall] Calling ${tool} (as ${actualToolName}) with args:`, JSON.stringify(args).substring(0, 200));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout for tool calls

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
      console.error(`⏱️ [mcpCall] Timeout after 20 seconds`);
      throw new Error(`Tool execution timed out after 20 seconds`);
    }
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Check API key
    if (!ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ANTHROPIC_API_KEY not configured'
      });
    }

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

    // Helper to call Claude with timeout
    async function callClaudeWithTimeout(body, timeoutMs = 45000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Claude API timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    }

    // Define all tools for ABBI - Email, Calendar, Asana
    const tools = [
      // === EMAIL READING TOOLS ===
      {
        name: 'm365_read_emails',
        description: 'List emails from a specific folder (inbox, sent items, etc.). Returns recent emails with preview.',
        input_schema: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: 'Folder name (e.g., "inbox", "sent items", "Important", "Deals")' },
            unread_only: { type: 'boolean', description: 'Only show unread emails (default: false)' },
            top: { type: 'number', description: 'Max emails to return (default: 20, max: 100)' }
          },
          required: ['folder']
        }
      },
      {
        name: 'm365_search_emails',
        description: 'Search emails across all folders using keywords, sender, subject, etc.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (keywords, "from:email", "subject:text", etc.)' },
            folder: { type: 'string', description: 'Optional folder to search in (default: search all folders)' },
            top: { type: 'number', description: 'Max results to return (default: 20)' }
          },
          required: ['query']
        }
      },
      {
        name: 'm365_get_email',
        description: 'Get full details of a specific email by ID (including complete body)',
        input_schema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Email message ID' }
          },
          required: ['message_id']
        }
      },
      // === EMAIL SENDING TOOLS ===
      {
        name: 'm365_send_email',
        description: 'Send a new email from John Stewart\'s account (jstewart@middleground.com)',
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
        description: 'Reply to an email. Can add CC and To recipients to loop in additional people. Use reply_all to include all original recipients.',
        input_schema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'ID of the email to reply to (from EMAIL CONTEXT)' },
            body: { type: 'string', description: 'Reply body text' },
            cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients to add (email addresses, optional)' },
            to: { type: 'array', items: { type: 'string' }, description: 'Additional To recipients to add (email addresses, optional)' },
            reply_all: { type: 'boolean', description: 'Reply to all original recipients (default: false, optional)' }
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
            message_id: { type: 'string', description: 'ID of the email to forward (from EMAIL CONTEXT)' },
            to: { type: 'array', items: { type: 'string' }, description: 'New recipient email addresses' },
            comment: { type: 'string', description: 'Your message to add before the forwarded email (optional)' }
          },
          required: ['message_id', 'to']
        }
      },
      // === CALENDAR TOOLS ===
      {
        name: 'm365_create_event',
        description: 'Create a new calendar event/meeting',
        input_schema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Meeting title' },
            start: { type: 'string', description: 'Start datetime in ISO format (e.g., 2026-01-24T14:00:00)' },
            end: { type: 'string', description: 'End datetime in ISO format' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses (optional)' },
            body: { type: 'string', description: 'Meeting description/agenda (optional)' },
            location: { type: 'string', description: 'Meeting location (optional)' },
            is_online: { type: 'boolean', description: 'Create as Teams meeting (optional)' }
          },
          required: ['subject', 'start', 'end']
        }
      },
      {
        name: 'm365_update_event',
        description: 'Update an existing calendar event',
        input_schema: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'Event ID to update' },
            subject: { type: 'string', description: 'New meeting title (optional)' },
            start: { type: 'string', description: 'New start datetime (optional)' },
            end: { type: 'string', description: 'New end datetime (optional)' },
            location: { type: 'string', description: 'New location (optional)' },
            body: { type: 'string', description: 'New description (optional)' }
          },
          required: ['event_id']
        }
      },
      {
        name: 'm365_delete_event',
        description: 'Delete/cancel a calendar event',
        input_schema: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'Event ID to delete' }
          },
          required: ['event_id']
        }
      },
      // === ASANA TOOLS ===
      {
        name: 'asana_create_task',
        description: 'Create a new task in Asana',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Task name' },
            notes: { type: 'string', description: 'Task description/notes (optional)' },
            project_id: { type: 'string', description: 'Project ID (MP Dashboard: 1209103059237595, Weekly Items: 1209022810695498)' },
            assignee: { type: 'string', description: 'Assignee GID (John Stewart: 373563475019846) (optional)' },
            due_on: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' }
          },
          required: ['name']
        }
      },
      {
        name: 'asana_update_task',
        description: 'Update an existing Asana task',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task GID to update' },
            name: { type: 'string', description: 'New task name (optional)' },
            notes: { type: 'string', description: 'New notes (optional)' },
            completed: { type: 'boolean', description: 'Mark as completed (optional)' },
            due_on: { type: 'string', description: 'New due date (optional)' }
          },
          required: ['task_id']
        }
      },
      {
        name: 'asana_create_project',
        description: 'Create a new project in Asana',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            notes: { type: 'string', description: 'Project description (optional)' },
            workspace: { type: 'string', description: 'Workspace GID (optional, uses default if omitted)' }
          },
          required: ['name']
        }
      }
    ];

    // Call Claude API with tools (with 45 second timeout)
    const response = await callClaudeWithTimeout({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: messages,
        tools: tools,
        system: `You are ABBI, the Executive Dashboard AI assistant for John Stewart, Managing Partner at Middleground Capital (private equity).

=== YOUR ROLE ===
You manage John's Executive Dashboard which displays:
- Unread emails from multiple accounts
- Calendar events for today
- Asana tasks from MP Dashboard and Weekly Items projects
- Recent Hive Mind activity

You can TAKE ACTION using tools - you're not just advisory, you execute tasks.

=== CONTEXT YOU RECEIVE ===
When viewing an email (EMAIL CONTEXT section):
- Message ID (required for reply/forward tools)
- From, To, CC, Subject, Body
- Received date

Additional context available:
- List of recent emails (first 20)
- Calendar events (first 10)
- Current dashboard view

=== TOOLS YOU HAVE ===

EMAIL READING:
- m365_read_emails: List emails from any folder (inbox, sent items, Important, Deals, etc.)
- m365_search_emails: Search emails by keywords, sender, subject across all folders
- m365_get_email: Get full email details including complete body by message ID

EMAIL ACTIONS:
- m365_send_email: Send new email (to, cc, subject, body)
- m365_reply_email: Reply AND add CC/To recipients (message_id, body, cc, to, reply_all)
- m365_forward_email: Forward email (message_id, to, comment)

CALENDAR MANAGEMENT:
- m365_create_event: Create meeting (subject, start, end, attendees, location, is_online)
- m365_update_event: Update meeting (event_id, + any field to change)
- m365_delete_event: Cancel meeting (event_id)

ASANA PROJECT MANAGEMENT:
- asana_create_task: Create task (name, notes, project_id, assignee, due_on)
- asana_update_task: Update task (task_id, + any field to change, completed)
- asana_create_project: Create project (name, notes, workspace)

John's Constants:
- Email: jstewart@middleground.com
- Asana GID: 373563475019846
- MP Dashboard Project: 1209103059237595
- Weekly Items Project: 1209022810695498

=== HOW TO WORK ===

**For Action Commands** (reply, send, forward, create, schedule):
1. Draft the content/details
2. IMMEDIATELY USE THE TOOL to execute
3. Report result: "✓ Done: [what you did]" or "❌ Failed: [error]"

**For Questions** (what should I say, how should I respond, analyze this):
1. Provide analysis and recommendations
2. DO NOT use tools unless John explicitly says to execute

**Adding People to Replies** (IMPORTANT):
m365_reply_email now supports adding CC AND To recipients!

Examples:
- "Check my sent folder" → m365_read_emails with folder: "sent items"
- "Did my email to Sarah send?" → m365_search_emails for emails to Sarah in sent items
- "Show me recent emails from the CEO" → m365_search_emails with query: "from:ceo@example.com"
- "List emails in the Deals folder" → m365_read_emails with folder: "Deals"
- "Reply saying I'll follow up tomorrow" → Draft reply, call m365_reply_email, report success
- "Reply and CC Sarah and Mark" → m365_reply_email with cc: ['sarah@example.com', 'mark@example.com']
- "Reply all and add john@example.com as CC" → m365_reply_email with reply_all: true, cc: ['john@example.com']
- "Reply and add Sarah to the email" → m365_reply_email with to: ['sarah@example.com']
- "Forward this to Sarah and Mark" → m365_forward_email with their emails
- "Create a task for this" → asana_create_task with appropriate project
- "Schedule a meeting with CFO next Tuesday 2pm" → m365_create_event
- "What should I say to this?" → Provide recommendation, DON'T send

**Email Formatting - PROFESSIONAL BUSINESS STYLE** (CRITICAL):
ALL emails you send or reply with MUST follow proper business email format:

1. **Greeting**: Start with appropriate salutation
   - First email: "Hi [Name]," or "Hello [Name],"
   - Formal: "Dear [Name],"
   - Reply to thread: Can be less formal but still professional

2. **Body Structure**:
   - Clear opening sentence stating purpose
   - Well-organized paragraphs (2-4 sentences each)
   - Bullet points for lists or multiple items
   - Proper spacing between paragraphs
   - Professional tone - NOT casual or informal

3. **Closing**: ALWAYS include
   - Closing line: "Best regards," or "Thank you," or "Regards,"
   - John's name: "John" or "John Stewart"

4. **Tone**: Executive/professional
   - Confident and authoritative
   - Clear and direct
   - Courteous but not overly casual
   - NO slang, emojis, or informal language

Example Format:
```
Hi [Name],

[Opening sentence with purpose]

[Body paragraph with details]

[Action items or next steps if applicable]

Best regards,
John
```

**Email Analysis Format**:
1. Recommended Action: What John should do
2. Key Points: Important info from email
3. Time-Sensitive: Deadlines or urgency
4. Draft Response: Suggested reply (if applicable)

Be direct, concise, professional. You're an executor, not just an advisor.`
    }, 45000); // 45 second timeout

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
          // Add user parameter for M365 tools
          const toolInput = { ...toolUse.input };
          if (toolUse.name.startsWith('m365_')) {
            toolInput.user = 'jstewart@middleground.com';
          }

          toolResult = await mcpCall(toolUse.name, toolInput);
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

        // Get final response from Claude (with 30 second timeout for second call)
        console.log(`🤖 Getting final response from Claude after tool execution...`);
        const response2 = await callClaudeWithTimeout({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: messages,
            tools: tools,
            system: 'You are ABBI, John Stewart\'s AI executive assistant at Middleground Capital.\n\nCAPABILITIES:\n- **READ emails** using m365_read_emails (list from folders), m365_search_emails (search), m365_get_email (get full email)\n- Analyze emails and provide recommendations  \n- Draft email responses\n- **SEND emails directly** using m365_send_email (new emails) or m365_reply_email (replies)\n- Answer questions about emails and provide context\n- Remember previous conversation history\n\nAVAILABLE TOOLS:\n- m365_read_emails: List emails from folders like "inbox", "sent items", "Important", "Deals"\n- m365_search_emails: Search emails by keywords or sender\n- m365_get_email: Get full email by message ID\n- m365_send_email: Send new email\n- m365_reply_email: Reply to email (needs message_id from EMAIL CONTEXT)\n- m365_forward_email: Forward email\n\nAVAILABLE CONTEXT:\n- When viewing an email, you receive the **Message ID** in the EMAIL CONTEXT section\n- This Message ID is what you need for the m365_reply_email tool (as the message_id parameter)\n- You also have from, to, subject, and body of the email\n\nWHEN USER ASKS YOU TO TAKE ACTION:\n- If user says "reply and say X" → Draft the reply with content X and USE THE TOOL to send it immediately\n- If user asks "draft a reply" → Show the draft WITHOUT sending\n- If user asks "check sent folder" → Use m365_read_emails with folder: "sent items"\n- If user asks "did my email send?" → Use m365_search_emails or m365_read_emails to verify\n- Always USE THE TOOLS when user asks you to send/reply/search/check folders\n- For replies: Use m365_reply_email with message_id from EMAIL CONTEXT\n- For new emails: Use m365_send_email with recipient addresses\n- Report tool results clearly: "✓ Email sent successfully" or "❌ Failed to send: [error]"\n\n**CRITICAL - EMAIL FORMATTING**:\nALL emails MUST use proper business format:\n- Greeting: "Hi [Name]," or "Dear [Name],"\n- Well-structured body with clear paragraphs\n- Closing: "Best regards," or "Thank you,"\n- Signature: "John" or "John Stewart"\n- Professional tone - NO casual language, slang, or emojis\n- Executive voice - confident, clear, authoritative\n\nExample:\nHi [Name],\n\n[Purpose statement]\n\n[Details/body]\n\nBest regards,\nJohn\n\n**IMPORTANT**: You CAN and SHOULD actually send emails when asked. Don\'t just SAY you sent it - actually use the tool. You can NOW also READ and SEARCH emails.\n\nRESPONSE FORMAT:\nFor email analysis:\n1) Recommended response - Whether to reply and suggested tone/content\n2) Key action items - Specific tasks to complete\n3) Deadlines & time-sensitive matters - Any urgent items\n\nBe direct, concise, and professional.'
        }, 30000); // 30 second timeout for tool response

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
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat question',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
