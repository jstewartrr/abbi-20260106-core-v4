// Unflag ALL flagged emails in both mailboxes
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
    console.log('🚩 UNFLAGGING ALL EMAILS');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    const mailboxes = ['jstewart@middleground.com', 'john@middleground.com'];
    const folders = ['inbox', 'Important', 'Portfolio Companies', 'Deals', 'Investors'];

    let totalUnflagged = 0;

    for (const mailbox of mailboxes) {
      console.log(`\n📬 Processing ${mailbox}...`);

      for (const folder of folders) {
        try {
          console.log(`  Fetching folder: ${folder}`);

          // Fetch ALL emails (read and unread)
          const result = await mcpCall('read_emails', {
            user: mailbox,
            folder: folder,
            unread_only: false,
            top: 100
          });

          if (result.emails && result.emails.length > 0) {
            // Get all flagged emails
            const flaggedEmails = result.emails.filter(e => e.flag?.flagStatus === 'flagged');

            console.log(`    Found ${flaggedEmails.length} flagged emails`);

            if (flaggedEmails.length > 0) {
              // Unflag all
              const emailIds = flaggedEmails.map(e => e.id);

              await mcpCall('flag_email', {
                message_ids: emailIds,
                user: mailbox,
                flag_status: 'notFlagged'
              });

              console.log(`    ✓ Unflagged ${emailIds.length} emails`);
              totalUnflagged += emailIds.length;
            }
          }
        } catch (error) {
          console.error(`    ✗ Error with ${folder}:`, error.message);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ UNFLAG ALL COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`🚩 Unflagged: ${totalUnflagged} emails`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'All emails unflagged',
      total_unflagged: totalUnflagged,
      processing_time: `${elapsed}s`
    });

  } catch (error) {
    console.error('\n❌ UNFLAG ALL ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
