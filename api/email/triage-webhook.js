// Make.com Webhook - Triggers email triage and caches results to Snowflake
// This endpoint should be called by Make.com scenarios on a schedule

const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Extend timeout for email processing
export const config = {
  maxDuration: 300, // 5 minutes max
};

async function mcpCall(gateway, tool, args = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(gateway, {
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

async function fetchEmails(mailbox, folders) {
  console.log(`📧 Fetching emails from ${mailbox}...`);
  const allEmails = [];

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const folder of folders) {
    try {
      console.log(`  Fetching folder: ${folder}`);
      const result = await mcpCall(M365_GATEWAY, 'read_emails', {
        user: mailbox,
        folder: folder,
        unread_only: false,
        top: 100
      });

      if (result.emails && result.emails.length > 0) {
        // Filter to last 7 days
        const recent = result.emails.filter(email => {
          const emailDate = new Date(email.date);
          return emailDate >= sevenDaysAgo;
        });

        console.log(`    ✓ ${recent.length} recent emails (${result.emails.length} total)`);
        allEmails.push(...recent);
      }
    } catch (error) {
      console.error(`    ✗ Error fetching ${folder}:`, error.message);
    }
  }

  return allEmails;
}

async function triageWithClaude(emails) {
  console.log(`\n🤖 Triaging ${emails.length} emails with Claude AI...`);
  const triaged = [];
  const batchSize = 30;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(emails.length/batchSize)} (${batch.length} emails)...`);

    const emailSummaries = batch.map(e =>
      `ID: ${e.id}\n  From: ${e.from}\n  Subject: ${e.subject}\n  Preview: ${(e.preview || '').substring(0, 200)}\n  Received: ${e.date}`
    ).join('\n\n');

    const prompt = `CRITICAL: Categorize ALL ${batch.length} emails below for John Stewart (Managing Partner at Middleground Capital).

${emailSummaries}

IMPORTANT: You MUST return exactly ${batch.length} results - one for EACH email above.

For each email, determine:
1. priority: "urgent", "high", "medium", or "fyi"
2. is_to_email: true if John is in To: line, false if CC
3. needs_response: true if requires John's action/response, false if just FYI
4. category: Assign based on priority + is_to_email + needs_response:
   - If priority is "urgent" OR "high": category = "Urgent/Priority"
   - If is_to_email=true AND needs_response=true: category = "TO - Need Response"
   - If is_to_email=true AND needs_response=false: category = "TO - FYI"
   - If is_to_email=false AND needs_response=true: category = "CC - Need Response"
   - If is_to_email=false AND needs_response=false: category = "CC - FYI"

Categorization rules:
- Portfolio company CEOs/CFOs = priority: high, needs_response: true
- Investors, placement agents, banks, lenders = priority: high, needs_response: true
- Legal (Dechert, etc.) = priority: high, needs_response: true
- Urgent matters = priority: urgent, needs_response: true
- Internal team emails TO John = priority: medium, evaluate needs_response
- CC emails = usually needs_response: false unless specifically asks John to do something
- Automated notifications/receipts/newsletters = priority: fyi, needs_response: false (mark as spam)
- No-reply senders = priority: fyi, needs_response: false (mark as spam)
- Spam/junk = priority: fyi, needs_response: false (mark as spam)

Return ONLY a JSON array with exactly ${batch.length} objects (no markdown, no explanation):
[
  {
    "id": "email_id_from_above",
    "priority": "high",
    "category": "Urgent/Priority",
    "is_to_email": true,
    "needs_response": true
  },
  ...
]`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${error}`);
      }

      const aiData = await response.json();
      let aiText = aiData.content[0].text.trim();
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

      const results = JSON.parse(aiText);

      // Merge AI results with email data
      for (const result of results) {
        const email = batch.find(e => e.id === result.id);
        if (email) {
          triaged.push({
            ...email,
            ...result
          });
        }
      }

      console.log(`    ✓ Triaged ${results.length} emails`);
    } catch (error) {
      console.error(`    ✗ Triage failed:`, error.message);
      // Continue with next batch
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return triaged;
}

async function cacheToSnowflake(emails) {
  console.log(`\n💾 Caching results to Snowflake...`);
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  // Cache ALL emails - no filtering (user wants to see everything)
  const important = emails;

  console.log(`  Caching ALL ${emails.length} emails (no filtering)`);

  // Delete emails older than 7 days
  try {
    await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
      sql: `DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE < '${sevenDaysAgoStr}'`
    });
    console.log(`  ✓ Cleared emails older than ${sevenDaysAgoStr}`);
  } catch (error) {
    console.error(`  ✗ Cache clear error:`, error.message);
  }

  // Insert/Update emails (MERGE to avoid overwriting processed emails)
  let cached = 0;
  for (const email of important) {
    try {
      // Use MERGE to update if exists, insert if not
      // IMPORTANT: Don't overwrite PROCESSED flag if email already exists and was processed
      const sql = `
        MERGE INTO SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS AS target
        USING (SELECT
          '${email.id.replace(/'/g, "''")}' AS EMAIL_ID,
          '${(email.subject || '').replace(/'/g, "''")}' AS SUBJECT,
          '${(email.from || '').replace(/'/g, "''")}' AS FROM_NAME,
          '${(email.from_email || email.from || '').replace(/'/g, "''")}' AS FROM_EMAIL,
          '${((email.preview || '').substring(0, 500)).replace(/'/g, "''")}' AS PREVIEW,
          '${email.category || 'Uncategorized'}' AS CATEGORY,
          '${email.priority || 'medium'}' AS PRIORITY,
          ${email.is_to_email ? 'true' : 'false'} AS IS_TO_EMAIL,
          ${email.needs_response ? 'true' : 'false'} AS NEEDS_RESPONSE,
          '${(email.folder || 'Inbox').replace(/'/g, "''")}' AS FOLDER,
          'jstewart@middleground.com' AS MAILBOX,
          '${email.date || new Date().toISOString()}' AS RECEIVED_AT,
          '${new Date().toISOString()}' AS PROCESSED_AT,
          '${today}' AS BRIEFING_DATE
        ) AS source
        ON target.EMAIL_ID = source.EMAIL_ID
        WHEN MATCHED THEN
          UPDATE SET
            SUBJECT = source.SUBJECT,
            FROM_NAME = source.FROM_NAME,
            FROM_EMAIL = source.FROM_EMAIL,
            PREVIEW = source.PREVIEW,
            CATEGORY = source.CATEGORY,
            PRIORITY = source.PRIORITY,
            IS_TO_EMAIL = source.IS_TO_EMAIL,
            NEEDS_RESPONSE = source.NEEDS_RESPONSE,
            FOLDER = source.FOLDER,
            PROCESSED_AT = source.PROCESSED_AT
        WHEN NOT MATCHED THEN
          INSERT (EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
                  CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
                  FOLDER, MAILBOX, RECEIVED_AT, PROCESSED_AT, BRIEFING_DATE, PROCESSED)
          VALUES (source.EMAIL_ID, source.SUBJECT, source.FROM_NAME, source.FROM_EMAIL, source.PREVIEW,
                  source.CATEGORY, source.PRIORITY, source.IS_TO_EMAIL, source.NEEDS_RESPONSE,
                  source.FOLDER, source.MAILBOX, source.RECEIVED_AT, source.PROCESSED_AT, source.BRIEFING_DATE, false)
      `;

      await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql });
      cached++;
    } catch (error) {
      console.error(`  ✗ Failed to cache ${email.id}:`, error.message);
    }
  }

  console.log(`  ✓ Cached/Updated ${cached}/${important.length} emails to Snowflake`);
  return cached;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify authentication (Make.com webhook or authorized request)
  const authHeader = req.headers['authorization'];
  const webhookSecret = process.env.WEBHOOK_SECRET || 'dev-secret-12345';

  if (authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - invalid webhook secret'
    });
  }

  try {
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL TRIAGE WEBHOOK TRIGGERED');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Mailboxes and folders - fetch from BOTH mailboxes and ALL key folders
    const mailboxFolders = {
      'jstewart@middleground.com': [
        'inbox',
        'Important',
        'Portfolio Companies',
        'Deals',
        'Investors'
      ],
      'john@middleground.com': [
        'inbox',
        'Important'
      ]
    };

    // Step 1: Fetch emails from BOTH mailboxes
    console.log('\n📥 STEP 1: Fetching emails from both mailboxes');
    let allEmails = [];

    for (const [mailbox, folders] of Object.entries(mailboxFolders)) {
      const mailboxEmails = await fetchEmails(mailbox, folders);
      console.log(`  ${mailbox}: ${mailboxEmails.length} emails`);
      allEmails.push(...mailboxEmails);
    }

    const emails = allEmails;
    console.log(`Total fetched: ${emails.length} emails from both inboxes\n`);

    if (emails.length === 0) {
      return res.json({
        success: true,
        message: 'No emails to process',
        total_emails: 0,
        cached_emails: 0,
        processing_time: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      });
    }

    // Step 2: Triage with AI
    console.log('\n🤖 STEP 2: AI Triage');
    const triaged = await triageWithClaude(emails);
    console.log(`Triaged: ${triaged.length}/${emails.length} emails`);

    // Step 3: Cache to Snowflake (excluding spam)
    console.log('\n💾 STEP 3: Cache to Snowflake');
    const cached = await cacheToSnowflake(triaged);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ TRIAGE COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Fetched: ${emails.length} | Triaged: ${triaged.length} | Cached: ${cached}`);
    console.log('='.repeat(60) + '\n');

    return res.json({
      success: true,
      message: 'Email triage completed successfully',
      total_emails_fetched: emails.length,
      emails_triaged: triaged.length,
      emails_cached: cached,
      processing_time: `${elapsed}s`,
      briefing_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('\n❌ TRIAGE ERROR:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Triage failed'
    });
  }
}
