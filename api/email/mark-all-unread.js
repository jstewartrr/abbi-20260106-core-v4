// Mark all emails from yesterday onwards as UNREAD in both mailboxes
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 300, // 5 minutes
};

async function mcpCall(tool, args = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(M365_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now()
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      const parsed = JSON.parse(content.text);
      if (!parsed.success && parsed.error) throw new Error(parsed.error);
      return parsed;
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify authentication
  const authHeader = req.headers['authorization'];
  const secret = process.env.WEBHOOK_SECRET || 'dev-secret-12345';

  if (authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📧 MARKING ALL RECENT EMAILS AS UNREAD');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Folders to process
    const folders = [
      'inbox',
      'Important',
      'Portfolio Companies',
      'Deals',
      'Investors'
    ];

    const mailboxes = ['jstewart@middleground.com', 'john@middleground.com'];

    let totalEmails = 0;
    let totalMarked = 0;

    for (const mailbox of mailboxes) {
      console.log(`\n📬 Processing ${mailbox}...`);

      for (const folder of folders) {
        try {
          console.log(`  Fetching folder: ${folder}`);

          // Fetch ALL emails (read and unread) from today + yesterday
          const result = await mcpCall('read_emails', {
            user: mailbox,
            folder: folder,
            unread_only: false,
            top: 100
          });

          if (result.emails && result.emails.length > 0) {
            // Filter to yesterday onwards
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            const recentEmails = result.emails.filter(email => {
              const emailDate = new Date(email.date);
              return emailDate >= yesterday;
            });

            console.log(`    Found ${recentEmails.length} recent emails`);
            totalEmails += recentEmails.length;

            if (recentEmails.length > 0) {
              // Mark all as UNREAD
              const emailIds = recentEmails.map(e => e.id);

              await mcpCall('mark_read', {
                message_ids: emailIds,
                user: mailbox,
                is_read: false // Mark as UNREAD
              });

              console.log(`    ✓ Marked ${emailIds.length} emails as UNREAD`);
              totalMarked += emailIds.length;
            }
          }
        } catch (error) {
          console.error(`    ✗ Error with ${folder}:`, error.message);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ MARK AS UNREAD COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Total: ${totalEmails} emails | Marked: ${totalMarked} as UNREAD`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'All recent emails marked as unread',
      total_emails: totalEmails,
      marked_unread: totalMarked,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ MARK UNREAD ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
