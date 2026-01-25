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
        // Filter to last 7 days and add mailbox info
        const recent = result.emails.filter(email => {
          const emailDate = new Date(email.date);
          return emailDate >= sevenDaysAgo;
        }).map(email => ({
          ...email,
          mailbox: mailbox  // Add mailbox so we know which account to use later
        }));

        console.log(`    ✓ ${recent.length} recent emails (${result.emails.length} total)`);
        allEmails.push(...recent);
      }
    } catch (error) {
      console.error(`    ✗ Error fetching ${folder}:`, error.message);
    }
  }

  return allEmails;
}

// Fetch full email bodies for detailed caching
async function fetchFullEmails(emails) {
  console.log(`\n📬 Fetching full email bodies for ${emails.length} emails...`);
  const fullEmails = [];

  for (const email of emails) {
    try {
      // Determine the correct mailbox for this email
      const mailbox = email.mailbox || 'jstewart@middleground.com';

      const result = await mcpCall(M365_GATEWAY, 'get_email', {
        message_id: email.id,
        user: mailbox
      }, 30000);

      if (result && result.body) {
        fullEmails.push({
          ...email,
          full_body: result.body,
          to: result.to || [],
          cc: result.cc || []
        });
        console.log(`  ✓ Fetched body for: ${email.subject?.substring(0, 50)}`);
      } else {
        // Keep email without full body
        fullEmails.push(email);
      }
    } catch (error) {
      console.error(`  ✗ Failed to fetch body for ${email.id}:`, error.message);
      fullEmails.push(email); // Keep without full body
    }
  }

  return fullEmails;
}

// Generate comprehensive AI analysis for each email
async function analyzeEmailsWithAI(emails) {
  console.log(`\n🧠 Generating comprehensive AI analysis for ${emails.length} emails...`);
  const analyzed = [];

  for (const email of emails) {
    try {
      const bodyForAI = (email.full_body || email.preview || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit to 5000 chars

      const prompt = `You are an executive assistant for John Stewart, Managing Partner at Middleground Capital (private equity firm).

Analyze this email and provide a structured response in JSON format:

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${bodyForAI}

Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence comprehensive summary of key points and context",
  "action_plan": ["Action item 1", "Action item 2"] or [] if no actions needed,
  "recommended_response": "Suggested email reply text" or "" if no reply needed
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (response.ok) {
        const aiData = await response.json();
        let aiText = aiData.content[0].text.trim();
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

        const analysis = JSON.parse(aiText);
        analyzed.push({
          ...email,
          ai_summary: analysis.summary || '',
          action_plan: JSON.stringify(analysis.action_plan || []),
          recommended_response: analysis.recommended_response || ''
        });
        console.log(`  ✓ Analyzed: ${email.subject?.substring(0, 50)}`);
      } else {
        console.error(`  ✗ AI analysis failed for ${email.id}`);
        analyzed.push(email);
      }

      // Small delay to avoid rate limits (reduced from 500ms to 100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`  ✗ Analysis error for ${email.id}:`, error.message);
      analyzed.push(email);
    }
  }

  return analyzed;
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

    const prompt = `Categorize ALL ${batch.length} emails below for John Stewart (Managing Partner at Middleground Capital).

${emailSummaries}

CRITICAL: You MUST return exactly ${batch.length} results - one for EACH email above. Include ALL emails, even automated notifications.

For each email, determine:
1. priority: "urgent", "high", "medium", or "low"
2. is_to_email: true if John is in To: line, false if CC
3. needs_response: true if requires John's action/response, false if just FYI
4. category: Assign based on content:
   - If priority is "urgent" OR "high": category = "Urgent/Priority"
   - If is_to_email=true AND needs_response=true: category = "TO - Need Response"
   - If is_to_email=true AND needs_response=false: category = "TO - FYI"
   - If is_to_email=false AND needs_response=true: category = "CC - Need Response"
   - If is_to_email=false AND needs_response=false: category = "CC - FYI"

Priority guidelines (be INCLUSIVE, when in doubt assign medium):
- Portfolio company communications = high
- Investor/partner communications = high
- Legal matters = high
- Internal team emails = medium
- Automated notifications = low (but still include them!)
- When uncertain = medium

Return ONLY a JSON array with exactly ${batch.length} objects (no markdown, no explanation):
[
  {
    "id": "email_id_from_above",
    "priority": "medium",
    "category": "TO - FYI",
    "is_to_email": true,
    "needs_response": false
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
      // Add emails with default categorization so they don't get dropped
      for (const email of batch) {
        triaged.push({
          ...email,
          priority: 'medium',
          category: 'TO - FYI',
          is_to_email: true,
          needs_response: false
        });
      }
      console.log(`    ✓ Added ${batch.length} emails with default categorization`);
    }

    // Small delay to avoid rate limits (reduced from 500ms to 200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
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
      // Escape and truncate fields for Snowflake
      const fullBody = (email.full_body || '').replace(/'/g, "''").substring(0, 65000);
      const aiSummary = (email.ai_summary || '').replace(/'/g, "''").substring(0, 5000);
      const actionPlan = (email.action_plan || '[]').replace(/'/g, "''").substring(0, 5000);
      const recommendedResponse = (email.recommended_response || '').replace(/'/g, "''").substring(0, 5000);

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
          '${email.mailbox || 'jstewart@middleground.com'}' AS MAILBOX,
          '${email.date || new Date().toISOString()}' AS RECEIVED_AT,
          '${new Date().toISOString()}' AS PROCESSED_AT,
          '${today}' AS BRIEFING_DATE,
          '${fullBody}' AS FULL_BODY,
          '${aiSummary}' AS AI_SUMMARY,
          '${actionPlan}' AS ACTION_PLAN,
          '${recommendedResponse}' AS RECOMMENDED_RESPONSE
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
            PROCESSED_AT = source.PROCESSED_AT,
            FULL_BODY = source.FULL_BODY,
            AI_SUMMARY = source.AI_SUMMARY,
            ACTION_PLAN = source.ACTION_PLAN,
            RECOMMENDED_RESPONSE = source.RECOMMENDED_RESPONSE
        WHEN NOT MATCHED THEN
          INSERT (EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
                  CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
                  FOLDER, MAILBOX, RECEIVED_AT, PROCESSED_AT, BRIEFING_DATE, PROCESSED,
                  FULL_BODY, AI_SUMMARY, ACTION_PLAN, RECOMMENDED_RESPONSE)
          VALUES (source.EMAIL_ID, source.SUBJECT, source.FROM_NAME, source.FROM_EMAIL, source.PREVIEW,
                  source.CATEGORY, source.PRIORITY, source.IS_TO_EMAIL, source.NEEDS_RESPONSE,
                  source.FOLDER, source.MAILBOX, source.RECEIVED_AT, source.PROCESSED_AT, source.BRIEFING_DATE, false,
                  source.FULL_BODY, source.AI_SUMMARY, source.ACTION_PLAN, source.RECOMMENDED_RESPONSE)
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
    // Get limit from query parameter (for testing)
    const emailLimit = req.query.limit ? parseInt(req.query.limit) : 10;

    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL TRIAGE WEBHOOK TRIGGERED');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`📊 Email processing limit: ${emailLimit}`);
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

    // Step 3: Check which emails need full analysis (to avoid timeout)
    console.log('\n🔍 STEP 3: Checking existing cache');
    const emailIds = triaged.map(e => e.id);
    const cacheCheckQuery = `
      SELECT EMAIL_ID, AI_SUMMARY
      FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
      WHERE EMAIL_ID IN ('${emailIds.map(id => id.replace(/'/g, "''")).join("','")}')
    `;

    let existingAnalysis = [];
    try {
      const result = await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql: cacheCheckQuery }, 15000);
      existingAnalysis = result.data || [];
    } catch (error) {
      console.log('  No existing cache or error:', error.message);
    }

    const emailsWithAnalysis = new Set(
      existingAnalysis
        .filter(row => row.AI_SUMMARY && row.AI_SUMMARY.length > 10)
        .map(row => row.EMAIL_ID)
    );

    const emailsNeedingAnalysis = triaged.filter(e => !emailsWithAnalysis.has(e.id));
    console.log(`  ${emailsWithAnalysis.size} emails already analyzed, ${emailsNeedingAnalysis.length} need analysis`);

    // Filter out junk/automated emails
    const junkDomains = ['dealcloud.com', 'noreply', 'no-reply', 'microsoft.com', 'azure', 'asana.com', 'equibase.com', 'bloodhorse.com', 'gmail.com'];
    const junkKeywords = ['Daily Interaction Summary', 'Daily Email Summary', 'Deals Added Today', 'Verify your', 'Undeliverable', 'Canceled:', 'Action required:', 'We noticed a new login', 'Workout Notification', 'Stock Availability', 'Get started with'];

    const realEmails = emailsNeedingAnalysis.filter(e => {
      const fromEmail = (e.from_email || e.from || '').toLowerCase();
      const subject = e.subject || '';

      // Skip if from junk domain
      if (junkDomains.some(d => fromEmail.includes(d))) return false;

      // Skip if subject contains junk keywords
      if (junkKeywords.some(k => subject.includes(k))) return false;

      return true;
    });

    console.log(`  Filtered to ${realEmails.length} real business emails (skipped ${emailsNeedingAnalysis.length - realEmails.length} junk)`);

    // Sort by priority: high first, then needs_response, then medium, then low
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1, 'fyi': 0 };
    realEmails.sort((a, b) => {
      // First sort by needs_response
      if (a.needs_response !== b.needs_response) {
        return b.needs_response ? 1 : -1;
      }
      // Then by priority
      return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
    });

    // Step 4: Fetch full email bodies (only for real business emails)
    let fullEmails = triaged;
    if (realEmails.length > 0) {
      console.log('\n📬 STEP 4: Fetching full email bodies');
      const limit = Math.min(realEmails.length, emailLimit); // Use emailLimit from query param
      const toProcess = realEmails.slice(0, limit);
      console.log(`  Processing ${limit} PRIORITY emails (${realEmails.length} real business emails need analysis)`);

      const fetchedFull = await fetchFullEmails(toProcess);

      // Merge: emails that needed analysis (with full bodies) + emails that don't need analysis (as is)
      fullEmails = [
        ...fetchedFull,
        ...triaged.filter(e => emailsWithAnalysis.has(e.id))
      ];
      console.log(`Full emails prepared: ${fullEmails.length}`);
    } else {
      console.log('\n✓ All emails already have analysis, skipping fetch');
    }

    // Step 5: Generate comprehensive AI analysis (only for real business emails)
    let analyzed = fullEmails;
    if (realEmails.length > 0) {
      console.log('\n🧠 STEP 5: Generating comprehensive AI analysis');
      const emailsWithBodies = fullEmails.filter(e => !emailsWithAnalysis.has(e.id));
      const analyzedNew = await analyzeEmailsWithAI(emailsWithBodies);

      // Merge: newly analyzed + already analyzed (as is)
      analyzed = [
        ...analyzedNew,
        ...fullEmails.filter(e => emailsWithAnalysis.has(e.id))
      ];
      console.log(`AI analysis complete: ${analyzedNew.length} new, ${analyzed.length} total`);
    } else {
      console.log('\n✓ All real business emails already analyzed, skipping AI generation');
    }

    // Step 6: Cache to Snowflake with full analysis
    console.log('\n💾 STEP 6: Cache to Snowflake');
    const cached = await cacheToSnowflake(analyzed);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ TRIAGE COMPLETE');
    console.log(`⏱️  Duration: ${elapsed}s`);
    console.log(`📊 Fetched: ${emails.length} | Triaged: ${triaged.length} | Business emails analyzed: ${realEmails.length > 10 ? 10 : realEmails.length} | Cached: ${cached}`);
    console.log(`📧 Skipped ${emailsNeedingAnalysis.length - realEmails.length} junk/automated emails`);
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
