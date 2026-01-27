export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email data required' });
  }

  try {
    // Call Claude to triage the email with detailed formatting
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are triaging an email. Follow these rules EXACTLY:

## Spam Detection (Step 1 & 2)
Identify as spam: DealCloud reports, Asana login notifications, bank statements/alerts, calendar cancellations, automated stock alerts, marketing emails, unsolicited sales pitches.

## Classification (Step 3 & 4)
- Check if the recipient email (${email.recipient_email}) is in the To: line or CC: line
- If To: line → classification = "To:"
- If CC: line → classification = "CC:"

## Detailed Analysis (Step 5-10)
Generate a comprehensive triage with:
1. Extract sender name and email
2. List all recipients (extract from email body/headers if available, otherwise use empty arrays)
3. Describe the purpose and key points with bullet points
4. Note any attachments
5. Identify action items
6. Determine priority: HIGH (urgent deadlines, deal closing, immediate action needed) or NORMAL
7. Tag: "Needs Response" (requires action/reply) or "FYI" (informational only)

IMPORTANT: You MUST include ALL fields below, even if empty arrays.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "is_spam": boolean,
  "classification": "To:" or "CC:",
  "priority": "HIGH" or "NORMAL",
  "tag": "Needs Response" or "FYI",
  "from_name": "Full Name",
  "from_email": "email@domain.com",
  "to_recipients": ["Name <email>", ...] (REQUIRED - empty array [] if unknown),
  "cc_recipients": ["Name <email>", ...] (REQUIRED - empty array [] if unknown),
  "summary": "- **Background:** context if available\n\n- **Purpose:** ...\n\n- **Key Points:** bullet list",
  "action_items": ["Action 1", "Action 2"],
  "attachments": ["filename1", "filename2"] or [],
  "conversation_context": "Brief note about email thread context if this is a reply"
}

Email to triage:
Subject: ${email.subject}
From: ${email.sender}
Folder: ${email.folder_name}
Body: ${email.body_content.substring(0, 4000)}
`
        }]
      })
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Claude API error: ${anthropicResponse.statusText}`);
    }

    const anthropicData = await anthropicResponse.json();
    const triageResult = JSON.parse(anthropicData.content[0].text);

    // If spam, delete and mark as read
    if (triageResult.is_spam) {
      const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
      let deleted = false;
      let marked_read = false;

      // Delete from M365
      try {
        const deleteResponse = await fetch(M365_GATEWAY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'm365_delete_email',
              arguments: {
                message_ids: [email.outlook_message_id],
                permanent: false,
                user: email.recipient_email || 'jstewart@middleground.com'
              }
            },
            id: Date.now()
          })
        });

        if (deleteResponse.ok) {
          const deleteData = await deleteResponse.json();
          deleted = deleteData.result?.content?.[0]?.text ? JSON.parse(deleteData.result.content[0].text).success : false;
        }
      } catch (error) {
        console.error('Failed to delete spam:', error.message);
      }

      // Mark as read
      try {
        const markReadResponse = await fetch(M365_GATEWAY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'm365_mark_read',
              arguments: {
                message_ids: [email.outlook_message_id],
                is_read: true,
                user: email.recipient_email || 'jstewart@middleground.com'
              }
            },
            id: Date.now()
          })
        });

        if (markReadResponse.ok) {
          const markReadData = await markReadResponse.json();
          marked_read = markReadData.result?.content?.[0]?.text ? JSON.parse(markReadData.result.content[0].text).success : false;
        }
      } catch (error) {
        console.error('Failed to mark spam as read:', error.message);
      }

      return res.json({
        success: true,
        action: 'delete',
        reason: 'spam',
        triage: triageResult,
        deleted: deleted,
        marked_read: marked_read
      });
    }

    // Save to Hive Mind via direct Snowflake INSERT
    const emailDetails = {
      email_id: email.id,
      outlook_message_id: email.outlook_message_id,
      folder_name: email.folder_name,
      subject: email.subject,
      from_name: triageResult.from_name,
      from_email: triageResult.from_email,
      to_recipients: triageResult.to_recipients,
      cc_recipients: triageResult.cc_recipients,
      received_at: email.received_at,
      classification: triageResult.classification,
      priority: triageResult.priority,
      tag: triageResult.tag,
      summary: triageResult.summary,
      action_items: triageResult.action_items,
      attachments: triageResult.attachments,
      conversation_context: triageResult.conversation_context,
      has_attachments: email.has_attachments,
      processed_at: new Date().toISOString()
    };

    // Escape strings for SQL
    const escapeSql = (str) => str.replace(/'/g, "''").replace(/\\/g, "\\\\").replace(/\n/g, " ").replace(/\r/g, "");
    const summaryText = `${escapeSql(email.subject)} - ${triageResult.tag} (${triageResult.priority})`;
    const detailsJson = JSON.stringify(emailDetails).replace(/'/g, "''").replace(/\\/g, "\\\\");

    const hiveMindResponse = await fetch('https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'query_snowflake',
          arguments: {
            sql: `INSERT INTO SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CATEGORY, SOURCE, SUMMARY, DETAILS, PRIORITY, WORKSTREAM) SELECT 'triaged_email', 'email-triage-api', '${summaryText}', PARSE_JSON('${detailsJson}'), '${triageResult.priority}', 'email'`
          }
        },
        id: 1
      })
    });

    if (!hiveMindResponse.ok) {
      throw new Error(`Hive Mind write error: ${hiveMindResponse.statusText}`);
    }

    const hiveMindData = await hiveMindResponse.json();
    if (hiveMindData.error) {
      console.error('Hive Mind SQL error:', hiveMindData.error);
      // Don't fail the whole request, just log the error
    }

    // Mark email as read in M365
    let marked_read = false;
    try {
      const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
      const markReadResponse = await fetch(M365_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'm365_mark_read',
            arguments: {
              message_ids: [email.outlook_message_id],
              is_read: true,
              user: email.recipient_email || 'jstewart@middleground.com'
            }
          },
          id: Date.now()
        })
      });

      if (markReadResponse.ok) {
        const markReadData = await markReadResponse.json();
        marked_read = markReadData.result?.content?.[0]?.text ? JSON.parse(markReadData.result.content[0].text).success : false;
      }
    } catch (error) {
      console.error('Failed to mark email as read:', error.message);
    }

    return res.json({
      success: true,
      action: 'triaged',
      triage: triageResult,
      hive_mind_saved: true,
      marked_read: marked_read
    });

  } catch (error) {
    console.error('Triage error:', error);
    return res.status(500).json({
      error: 'Triage failed',
      details: error.message
    });
  }
}
