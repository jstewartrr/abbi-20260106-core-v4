// ABBI Chat Q&A - Answer questions about emails with full context
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function snowflakeCall(query, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(SNOWFLAKE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'sm_query_snowflake', arguments: { sql: query } },
        id: Date.now()
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Snowflake HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      const parsed = JSON.parse(content.text);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
      if (parsed.success) {
        return [];
      }
      throw new Error(parsed.error || 'Unknown Snowflake error');
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchContacts(query) {
  // Search Hive Mind for contacts matching the query
  const searchQuery = `
    SELECT
      SUMMARY,
      DETAILS,
      TIMESTAMP
    FROM SOVEREIGN_MIND.RAW.HIVE_MIND
    WHERE CATEGORY = 'Contact'
      AND SOURCE = 'ABBI Contact Sync'
      AND (
        LOWER(SUMMARY) LIKE LOWER('%${query.replace(/'/g, "''")}%')
        OR LOWER(DETAILS:name::STRING) LIKE LOWER('%${query.replace(/'/g, "''")}%')
        OR LOWER(DETAILS:email::STRING) LIKE LOWER('%${query.replace(/'/g, "''")}%')
        OR LOWER(DETAILS:company::STRING) LIKE LOWER('%${query.replace(/'/g, "''")}%')
        OR LOWER(DETAILS:reference_name::STRING) LIKE LOWER('%${query.replace(/'/g, "''")}%')
      )
    ORDER BY TIMESTAMP DESC
    LIMIT 10
  `;

  return await snowflakeCall(searchQuery);
}

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

    // Check if user is requesting a contact database refresh
    const refreshKeywords = ['refresh contacts', 'sync contacts', 'update contacts', 'refresh hive mind', 'sync hive mind', 'reload contacts'];
    const isRefreshRequest = refreshKeywords.some(keyword => question.toLowerCase().includes(keyword));

    if (isRefreshRequest) {
      console.log('🔄 Detected contact refresh request');

      try {
        // Call the sync API to refresh contacts from source files
        const syncResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/contacts/sync-from-files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        const syncData = await syncResponse.json();

        if (syncData.success) {
          return res.json({
            success: true,
            answer: `✅ **Contact database refreshed successfully!**\n\n- **Total contacts synced:** ${syncData.total_synced || 'Unknown'}\n- **Last updated:** Just now\n\nYour contact database is now up to date. You can ask me about any contact.`,
            has_email_context: false
          });
        } else {
          return res.json({
            success: true,
            answer: `⚠️ **Contact refresh encountered an issue:**\n\n${syncData.error || 'Unknown error'}\n\nYou can still search existing contacts. Let me know if you need help.`,
            has_email_context: false
          });
        }
      } catch (refreshError) {
        console.error('Contact refresh failed:', refreshError.message);
        return res.json({
          success: true,
          answer: `❌ **Unable to refresh contacts right now.**\n\nError: ${refreshError.message}\n\nYour existing contact database is still available for searching. Try again later or contact support.`,
          has_email_context: false
        });
      }
    }

    // Check if question is about finding a contact
    const contactKeywords = ['email', 'contact', 'reach', 'address', 'phone', 'ceo', 'cfo', 'find', 'who is', 'how do i contact'];
    const isContactQuery = contactKeywords.some(keyword => question.toLowerCase().includes(keyword));

    let contactResults = [];
    if (isContactQuery) {
      console.log('📇 Detected contact query - searching Hive Mind...');
      try {
        // Extract potential names from question
        const words = question.split(' ');
        for (const word of words) {
          if (word.length > 2 && word[0] === word[0].toUpperCase()) {
            const results = await searchContacts(word);
            contactResults.push(...results);
          }
        }
        // Remove duplicates
        contactResults = contactResults.filter((contact, index, self) =>
          index === self.findIndex((c) => c.SUMMARY === contact.SUMMARY)
        );
        console.log(`📇 Found ${contactResults.length} contacts in Hive Mind`);

        // If no results in Hive Mind, search emails as fallback
        if (contactResults.length === 0 && user) {
          console.log('📧 No contacts in Hive Mind - searching emails...');
          try {
            // Extract search query (name or company)
            const searchTerms = words.filter(w => w.length > 2 && w[0] === w[0].toUpperCase()).join(' ');
            if (searchTerms) {
              const emailResults = await mcpCall('m365_search_emails', {
                query: searchTerms,
                user: user,
                top: 5
              }, 20000);

              if (emailResults.emails && emailResults.emails.length > 0) {
                console.log(`📧 Found ${emailResults.emails.length} emails from/to this person`);
                // Extract unique email addresses and names
                const uniqueContacts = new Map();
                emailResults.emails.forEach(email => {
                  if (email.from && email.from.toLowerCase().includes(searchTerms.toLowerCase())) {
                    const key = email.from.toLowerCase();
                    if (!uniqueContacts.has(key)) {
                      uniqueContacts.set(key, {
                        SUMMARY: `${email.from_name || email.from} (found in emails)`,
                        DETAILS: { name: email.from_name || email.from, email: email.from, source: 'email_search' }
                      });
                    }
                  }
                });
                contactResults = Array.from(uniqueContacts.values());
              }
            }
          } catch (emailSearchError) {
            console.warn('Email contact search failed:', emailSearchError.message);
          }
        }
      } catch (searchError) {
        console.warn('Contact search failed:', searchError.message);
      }
    }

    // Build context for AI
    let emailData = null;
    let contextText = '';

    // Add contact information to context if found
    if (contactResults.length > 0) {
      contextText += 'Contact Information from Database:\n';
      contactResults.forEach(contact => {
        const details = contact.DETAILS;
        contextText += `- ${details.name || 'Unknown'}`;
        if (details.email) contextText += ` (${details.email})`;
        if (details.role) contextText += ` - ${details.role}`;
        if (details.company) contextText += ` at ${details.company}`;
        if (details.reference_name) contextText += ` [also known as: ${details.reference_name}]`;
        if (details.phone) contextText += ` | Phone: ${details.phone}`;
        contextText += '\n';
      });
      contextText += '\n';
    }

    // If we have email context from the frontend, use it
    if (email_context) {
      contextText = `Email Context:
From: ${email_context.from || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Summary: ${email_context.comprehensive_summary || 'No summary available'}`;

      // Add attachment information if available
      if (email_context.hasAttachments || (email_context.attachments && email_context.attachments.length > 0)) {
        const attachments = email_context.attachments || [];
        contextText += `\nAttachments: ${attachments.length > 0 ? attachments.map(a => a.name || a.filename || 'unnamed').join(', ') : 'Yes (count unknown)'}`;
      }

      contextText += `\n\n${email_context.body ? 'Full Email Body:\n' + email_context.body.substring(0, 2000) : ''}`;
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
Subject: ${emailData.subject || 'No subject'}`;

          // Add attachment information if available
          if (emailData.hasAttachments || (emailData.attachments && emailData.attachments.length > 0)) {
            const attachments = emailData.attachments || [];
            contextText += `\nAttachments: ${attachments.length > 0 ? attachments.map(a => a.name || a.filename || 'unnamed').join(', ') : 'Yes (metadata not detailed)'}`;
          }

          contextText += `\n\nEmail Body:
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

**Your Current Capabilities:**
You have FULL access to:
- John's Microsoft 365 email account - you can read all emails, including full content, sender/recipients, and metadata
- John's comprehensive contact database (2,000+ contacts: employees, portfolio CEOs/CFOs, investors, investment banks)
- Calendar and meeting information via M365 integration
- Real-time email search and analysis

**Current Limitations:**
- Email attachments: You can see that attachments exist and their names, but cannot currently read the contents of PDFs, Word docs, or Excel files. If asked about attachment contents, politely explain this limitation and offer to help with the email text instead.
- File downloads: You cannot download files directly, but you can see attachment metadata

**How to Answer Questions:**
1. **Email questions**: Reference specific details from the email context provided (sender, recipients, subject, body text)
2. **Contact questions**: Search the contact database and provide complete contact details (name, email, phone, company, role)
3. **People questions**: Use context to identify key people and provide relevant contact information
4. **Document questions**: If asked about attachment contents, explain the limitation but offer to help with email body analysis
5. **Action items**: Identify next steps, deadlines, and important follow-ups from email content

**Formatting Guidelines:**
- Use bullet points (-) for lists of actions or key points
- Use **bold** for emphasis on important names, companies, or deadlines
- Keep responses well-structured and easy to scan
- When listing action items, use numbered lists (1., 2., 3.)
- Format contact info clearly: **Name** (email@domain.com) - Role at Company | Phone: xxx-xxx-xxxx`,
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
