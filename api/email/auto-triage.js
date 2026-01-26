// Auto-triage emails from RAW.EMAILS table
// This should be called every 5 minutes by Make.com or a cron job

const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const TRIAGE_API_BASE = 'https://abbi-ai.com/api/email';

export const config = {
  maxDuration: 300, // 5 minutes max
};

async function mcpCall(tool, args) {
  const res = await fetch(SNOWFLAKE_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: tool, arguments: args },
      id: Date.now()
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const content = data.result?.content?.[0];
  return content?.type === 'text' ? JSON.parse(content.text) : content;
}

async function triageEmail(email) {
  const response = await fetch(`${TRIAGE_API_BASE}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        id: email.ID,
        outlook_message_id: email.OUTLOOK_MESSAGE_ID,
        subject: email.SUBJECT,
        sender: email.SENDER,
        folder_name: email.FOLDER_NAME,
        body_content: email.BODY_CONTENT || email.BODY_PREVIEW || '',
        received_at: email.RECEIVED_AT,
        recipient_email: 'jstewart@middleground.com'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Triage API error: ${response.statusText}`);
  }

  return await response.json();
}

async function markEmailRead(messageId, user = 'jstewart@middleground.com') {
  try {
    await mcpCall('m365_mark_read', {
      message_id: messageId,
      user: user
    });
    return true;
  } catch (error) {
    console.error(`Failed to mark email ${messageId} as read:`, error.message);
    return false;
  }
}

async function deleteEmail(messageId, user = 'jstewart@middleground.com') {
  try {
    await mcpCall('m365_delete_email', {
      message_id: messageId,
      user: user
    });
    return true;
  } catch (error) {
    console.error(`Failed to delete email ${messageId}:`, error.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 AUTO-TRIAGE STARTED');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Get already triaged email IDs from HIVE_MIND
    console.log('\n📋 Fetching already triaged emails...');
    const triagedResult = await mcpCall('sm_query_snowflake', {
      sql: `SELECT DETAILS:outlook_message_id::string as outlook_message_id
            FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
            WHERE CATEGORY = 'triaged_email'`
    });

    const triagedIds = new Set(
      triagedResult.data.map(row => row.OUTLOOK_MESSAGE_ID).filter(Boolean)
    );
    console.log(`   Already triaged: ${triagedIds.size} emails`);

    // Get recent unprocessed emails from RAW.EMAILS (last 7 days)
    console.log('\n📥 Fetching unprocessed emails from RAW.EMAILS...');
    const emailsResult = await mcpCall('sm_query_snowflake', {
      sql: `SELECT ID, OUTLOOK_MESSAGE_ID, SUBJECT, SENDER, FOLDER_NAME,
                   BODY_CONTENT, BODY_PREVIEW, RECEIVED_AT
            FROM SOVEREIGN_MIND.RAW.EMAILS
            WHERE RECEIVED_AT >= DATEADD(day, -7, CURRENT_TIMESTAMP())
            ORDER BY RECEIVED_AT DESC
            LIMIT 100`
    });

    const allEmails = emailsResult.data || [];
    console.log(`   Found ${allEmails.length} recent emails in RAW.EMAILS`);

    // Filter to only untriaged emails
    const untriagedEmails = allEmails.filter(email =>
      email.OUTLOOK_MESSAGE_ID && !triagedIds.has(email.OUTLOOK_MESSAGE_ID)
    );
    console.log(`   Need to triage: ${untriagedEmails.length} emails`);

    if (untriagedEmails.length === 0) {
      console.log('\n✅ No new emails to triage');
      return res.json({
        success: true,
        message: 'No new emails to triage',
        emails_processed: 0,
        processing_time: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      });
    }

    // Process emails in batches
    const batchSize = 10;
    let successCount = 0;
    let spamCount = 0;
    let errorCount = 0;
    let readCount = 0;
    let deletedCount = 0;

    console.log('\n' + '─'.repeat(60));
    console.log(`Processing ${untriagedEmails.length} emails...`);

    for (let i = 0; i < untriagedEmails.length; i++) {
      const email = untriagedEmails[i];

      try {
        console.log(`\n[${i + 1}/${untriagedEmails.length}] ${email.SUBJECT}`);
        console.log(`   From: ${email.SENDER}`);

        // Triage the email
        const result = await triageEmail(email);

        if (result.action === 'delete') {
          // Spam - delete it
          console.log(`   🗑️  SPAM - deleting`);
          const deleted = await deleteEmail(email.OUTLOOK_MESSAGE_ID);
          if (deleted) deletedCount++;
          spamCount++;
        } else {
          // Real email - mark as read
          console.log(`   ✅ Triaged - Priority: ${result.triage?.priority}, Tag: ${result.triage?.tag}`);
          const marked = await markEmailRead(email.OUTLOOK_MESSAGE_ID);
          if (marked) readCount++;
          successCount++;
        }

        // Rate limiting - 2 second delay between emails
        if (i < untriagedEmails.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
      }

      // Stop after processing batch to avoid timeout
      if (i >= batchSize - 1) {
        console.log(`\n⚠️  Processed batch of ${batchSize}, stopping to avoid timeout`);
        console.log(`   Remaining: ${untriagedEmails.length - batchSize} emails (will process on next run)`);
        break;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ AUTO-TRIAGE COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Results:`);
    console.log(`   ✅ Triaged: ${successCount}`);
    console.log(`   🗑️  Spam deleted: ${spamCount} (${deletedCount} actually deleted)`);
    console.log(`   📖 Marked read: ${readCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'Auto-triage completed',
      emails_triaged: successCount,
      emails_deleted: spamCount,
      emails_marked_read: readCount,
      errors: errorCount,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ AUTO-TRIAGE ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
