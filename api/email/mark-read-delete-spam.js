// Simple endpoint to mark emails as read and delete spam
// Does NOT triage or populate HIVE_MIND - just inbox management

const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60, // 1 minute max
};

async function mcpCall(tool, args) {
  const res = await fetch(M365_GATEWAY, {
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

function isSpam(email) {
  const subject = (email.subject || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const fromName = (email.from_name || '').toLowerCase();

  // Obvious spam patterns
  const spamKeywords = [
    'daily liquidity report',
    'daily interaction summary',
    'daily email summary',
    'deals added today',
    'verify your',
    'undeliverable',
    'action required:',
    'we noticed a new login',
    'workout notification',
    'stock availability',
    'get started with',
    'statement is now available',
    'notification',
    'alert',
    'has invited you',
    'join the meeting',
    'meeting reminder timer'
  ];

  const spamDomains = [
    'dealcloud.com',
    'noreply',
    'no-reply',
    'no_reply',
    'asana.com',
    'equibase.com',
    'bloodhorse.com',
    'truist.com',
    'forbescouncils.com',
    'apple.com'
  ];

  // Check subject
  if (spamKeywords.some(keyword => subject.includes(keyword))) {
    return true;
  }

  // Check sender domain
  if (spamDomains.some(domain => from.includes(domain))) {
    return true;
  }

  // Obvious solicitation emails
  if (subject.includes('acquisition opportunity') ||
      subject.includes('seeking someone') ||
      subject.includes('limited $') ||
      subject.includes('cold storage is exploding')) {
    return true;
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📧 MARK READ & DELETE SPAM');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    const user = 'jstewart@middleground.com';

    // Folders to process
    const folders = ['Inbox', '01.01 John', '01.02 Scot', '01.03 Tom', '01.04 Kathryn', '01.05 Will'];

    console.log(`\n📥 Fetching unread emails from ${folders.length} folders...`);

    let allUnreadEmails = [];
    for (const folder of folders) {
      try {
        const result = await mcpCall('m365_read_emails', {
          user: user,
          folder: folder,
          unread_only: true,
          top: 50
        });

        if (result.emails && result.emails.length > 0) {
          console.log(`   ${folder}: ${result.emails.length} unread`);
          allUnreadEmails.push(...result.emails);
        }
      } catch (error) {
        console.error(`   Error fetching ${folder}:`, error.message);
      }
    }

    console.log(`\n📊 Total unread: ${allUnreadEmails.length}`);

    if (allUnreadEmails.length === 0) {
      console.log('✅ No unread emails');
      return res.json({
        success: true,
        message: 'No unread emails',
        marked_read: 0,
        deleted: 0
      });
    }

    // Separate spam from real emails
    const spamEmails = [];
    const realEmails = [];

    console.log('\n🔍 Checking for spam...');
    for (const email of allUnreadEmails) {
      if (isSpam(email)) {
        console.log(`   🗑️  SPAM: ${email.subject}`);
        spamEmails.push(email.id);
      } else {
        realEmails.push(email.id);
      }
    }

    console.log(`\n   Real emails: ${realEmails.length}`);
    console.log(`   Spam: ${spamEmails.length}`);

    // Mark real emails as read (batch)
    let markedCount = 0;
    if (realEmails.length > 0) {
      console.log(`\n📖 Marking ${realEmails.length} real emails as read...`);
      const result = await mcpCall('m365_mark_read', {
        message_ids: realEmails,
        is_read: true,
        user: user
      });
      markedCount = result.results?.filter(r => r.success).length || 0;
      console.log(`   ✅ Marked ${markedCount} as read`);
    }

    // Delete spam (batch)
    let deletedCount = 0;
    if (spamEmails.length > 0) {
      console.log(`\n🗑️  Deleting ${spamEmails.length} spam emails...`);
      const result = await mcpCall('m365_delete_email', {
        message_ids: spamEmails,
        permanent: false,
        user: user
      });
      deletedCount = result.results?.filter(r => r.success).length || 0;
      console.log(`   ✅ Deleted ${deletedCount} spam`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Marked read: ${markedCount}/${realEmails.length}`);
    console.log(`🗑️  Deleted: ${deletedCount}/${spamEmails.length}`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'Inbox management complete',
      marked_read: markedCount,
      deleted: deletedCount,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
