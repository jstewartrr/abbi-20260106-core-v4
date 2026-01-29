// Batch email triage endpoint for Make.com scenarios
// Processes all unread emails from specified user

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from query or body
    const user = req.query.user || req.body?.user || 'john@middleground.com';

    console.log(`[Batch Triage] Processing emails for: ${user}`);

    // Call M365 MCP to search for unread emails
    const searchResponse = await fetch('https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'm365_search_emails',
          arguments: {
            query: 'isread:false',
            top: 50,
            user: user
          }
        },
        id: 1
      })
    });

    const searchData = await searchResponse.json();

    if (!searchData.result || !searchData.result.content) {
      console.log('[Batch Triage] No results from M365 search');
      return res.status(200).json({
        success: true,
        processed: 0,
        message: 'No unread emails found'
      });
    }

    // Parse the MCP response
    const content = searchData.result.content;
    const textContent = content.find(c => c.type === 'text');
    if (!textContent) {
      return res.status(200).json({
        success: true,
        processed: 0,
        message: 'No emails in response'
      });
    }

    const emailList = JSON.parse(textContent.text);
    const emails = emailList.emails || [];

    console.log(`[Batch Triage] Found ${emails.length} unread emails`);

    const results = {
      total: emails.length,
      processed: 0,
      errors: 0,
      details: []
    };

    // Process each email
    for (const email of emails) {
      try {
        // Get full email content
        const emailResponse = await fetch('https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'm365_get_email',
              arguments: {
                message_id: email.id,
                user: user
              }
            },
            id: 2
          })
        });

        const emailData = await emailResponse.json();

        if (!emailData.result || !emailData.result.content) {
          results.errors++;
          results.details.push({ id: email.id, error: 'Failed to get email content' });
          continue;
        }

        const emailContent = emailData.result.content.find(c => c.type === 'text');
        if (!emailContent) {
          results.errors++;
          results.details.push({ id: email.id, error: 'No email content' });
          continue;
        }

        const fullEmail = JSON.parse(emailContent.text);

        // Send to triage API
        const triageResponse = await fetch('https://abbi-ai.com/api/email/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: {
              id: fullEmail.id,
              outlook_message_id: fullEmail.id,
              subject: fullEmail.subject || '',
              sender: `${fullEmail.from?.name || ''} <${fullEmail.from?.address || ''}>`,
              recipient_email: user,
              folder_name: 'Inbox',
              received_at: fullEmail.date,
              has_attachments: fullEmail.has_attachments || false,
              body_content: fullEmail.body || ''
            }
          })
        });

        const triageResult = await triageResponse.json();

        if (triageResult.success) {
          results.processed++;
          results.details.push({
            id: email.id,
            subject: email.subject,
            action: triageResult.action
          });
        } else {
          results.errors++;
          results.details.push({
            id: email.id,
            subject: email.subject,
            error: triageResult.error
          });
        }

      } catch (emailError) {
        console.error(`[Batch Triage] Error processing email ${email.id}:`, emailError);
        results.errors++;
        results.details.push({ id: email.id, error: emailError.message });
      }
    }

    console.log(`[Batch Triage] Complete: ${results.processed} processed, ${results.errors} errors`);

    return res.status(200).json({
      success: true,
      user: user,
      ...results
    });

  } catch (error) {
    console.error('[Batch Triage] Fatal error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
