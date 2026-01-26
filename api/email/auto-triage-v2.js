// Auto-triage UNREAD emails directly from M365 (not from RAW.EMAILS)
// This ensures we always have correct message IDs for mark-as-read

const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const TRIAGE_API_BASE = 'https://abbi-ai.com/api/email';

export const config = {
  maxDuration: 300, // 5 minutes max
};

async function mcpCall(tool, args, gateway) {
  const res = await fetch(gateway, {
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

async function getFullEmail(messageId, user) {
  return await mcpCall('m365_get_email', {
    message_id: messageId,
    user: user
  }, M365_GATEWAY);
}

async function triageEmail(email, messageId, folder, user) {
  const response = await fetch(`${TRIAGE_API_BASE}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        id: messageId,
        outlook_message_id: messageId,
        subject: email.subject,
        sender: email.from,
        folder_name: folder,
        body_content: email.body || email.bodyPreview || '',
        received_at: email.receivedDateTime || email.date,
        recipient_email: user
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Triage API error: ${response.statusText}`);
  }

  return await response.json();
}

async function markEmailRead(messageIds, user) {
  try {
    const result = await mcpCall('m365_mark_read', {
      message_ids: messageIds,
      is_read: true,
      user: user
    }, M365_GATEWAY);
    return result;
  } catch (error) {
    console.error(`Failed to mark emails as read:`, error.message);
    return { success: false, error: error.message };
  }
}

async function deleteEmails(messageIds, user) {
  try {
    const result = await mcpCall('m365_delete_email', {
      message_ids: messageIds,
      permanent: false,
      user: user
    }, M365_GATEWAY);
    return result;
  } catch (error) {
    console.error(`Failed to delete emails:`, error.message);
    return { success: false, error: error.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 AUTO-TRIAGE V2 STARTED (Direct M365 fetch)');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Folders to check for unread emails
    const foldersToCheck = [
      'Inbox',
      '01.01 John',
      '01.02 Scot',
      '01.03 Tom',
      '01.04 Kathryn',
      '01.05 Will',
      '01.13 MC',
      '01.24 N Transaction Team',
      '01.26 N Operations Team',
      '01.28 Human Capital',
      '02.05 Dechert'
    ];

    const user = 'jstewart@middleground.com';

    console.log(`\n📥 Fetching unread emails from ${foldersToCheck.length} folders...`);

    let allUnreadEmails = [];
    for (const folder of foldersToCheck) {
      try {
        const result = await mcpCall('m365_read_emails', {
          user: user,
          folder: folder,
          unread_only: true,
          top: 20
        }, M365_GATEWAY);

        if (result.emails && result.emails.length > 0) {
          console.log(`   ${folder}: ${result.emails.length} unread`);
          allUnreadEmails.push(...result.emails.map(e => ({ ...e, folder })));
        }
      } catch (error) {
        console.error(`   Error fetching ${folder}:`, error.message);
      }
    }

    console.log(`\n📊 Total unread emails: ${allUnreadEmails.length}`);

    if (allUnreadEmails.length === 0) {
      console.log('✅ No unread emails to process');
      return res.json({
        success: true,
        message: 'No unread emails to process',
        emails_processed: 0,
        processing_time: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      });
    }

    // Process emails in batch
    const batchSize = 10;
    const emailsToProcess = allUnreadEmails.slice(0, batchSize);

    console.log(`\n🔄 Processing ${emailsToProcess.length} emails...`);
    console.log('─'.repeat(60));

    let successCount = 0;
    let spamCount = 0;
    let errorCount = 0;
    const emailsToMarkRead = [];
    const emailsToDelete = [];

    for (let i = 0; i < emailsToProcess.length; i++) {
      const email = emailsToProcess[i];

      try {
        console.log(`\n[${i + 1}/${emailsToProcess.length}] ${email.subject}`);
        console.log(`   From: ${email.from}`);
        console.log(`   Folder: ${email.folder}`);

        // Get full email body
        const fullEmail = await getFullEmail(email.id, user);

        // Triage the email
        const result = await triageEmail(fullEmail, email.id, email.folder, user);

        if (result.action === 'delete') {
          console.log(`   🗑️  SPAM - will delete`);
          emailsToDelete.push(email.id);
          spamCount++;
        } else {
          console.log(`   ✅ Triaged - Priority: ${result.triage?.priority}, Tag: ${result.triage?.tag}`);
          emailsToMarkRead.push(email.id);
          successCount++;
        }

        // Rate limiting
        if (i < emailsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    // Mark real emails as read (batch operation)
    let markedReadCount = 0;
    if (emailsToMarkRead.length > 0) {
      console.log(`\n📖 Marking ${emailsToMarkRead.length} emails as read...`);
      const markResult = await markEmailRead(emailsToMarkRead, user);
      if (markResult.success) {
        markedReadCount = markResult.results?.filter(r => r.success).length || emailsToMarkRead.length;
        console.log(`   ✅ Marked ${markedReadCount} emails as read`);
      }
    }

    // Delete spam (batch operation)
    let deletedCount = 0;
    if (emailsToDelete.length > 0) {
      console.log(`\n🗑️  Deleting ${emailsToDelete.length} spam emails...`);
      const deleteResult = await deleteEmails(emailsToDelete, user);
      if (deleteResult.success) {
        deletedCount = deleteResult.results?.filter(r => r.success).length || emailsToDelete.length;
        console.log(`   ✅ Deleted ${deletedCount} spam emails`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ AUTO-TRIAGE V2 COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Results:`);
    console.log(`   ✅ Triaged: ${successCount}`);
    console.log(`   📖 Marked read: ${markedReadCount}/${emailsToMarkRead.length}`);
    console.log(`   🗑️  Spam deleted: ${deletedCount}/${emailsToDelete.length}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'Auto-triage completed',
      emails_triaged: successCount,
      emails_marked_read: markedReadCount,
      emails_deleted: deletedCount,
      errors: errorCount,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ AUTO-TRIAGE V2 ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
