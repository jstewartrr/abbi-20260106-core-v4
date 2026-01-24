// Daily Executive Email Briefing
// Processes all emails in folder priority order, surfaces only what needs attention with full context

// Extend Vercel function timeout to 60s for email processing
export const config = {
  maxDuration: 60,
};

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
        params: { name: 'query_snowflake', arguments: { sql: query } },
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
        return parsed.data; // Return the data array directly
      }
      if (parsed.success) {
        return []; // Success but no data
      }
      throw new Error(parsed.error || 'Unknown Snowflake error');
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mcpCall(tool, args = {}, timeoutMs = 10000) {
  const actualToolName = tool.startsWith('m365_') ? tool.substring(5) : tool;
  console.log(`[mcpCall] Calling ${actualToolName} with args:`, JSON.stringify(args));

  // Create abort controller for timeout
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
    console.log(`[mcpCall] Response status: ${res.status}, text length: ${responseText.length}`);
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${responseText.substring(0, 200)}`);

    const data = JSON.parse(responseText);
    if (data.error) {
      console.log(`[mcpCall] ERROR in response:`, data.error);
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const content = data.result?.content?.[0];
    console.log(`[mcpCall] Content type: ${content?.type}`);
    if (content?.type === 'text') {
      console.log(`[mcpCall] Text content length: ${content.text?.length}`);
      try {
        const parsed = JSON.parse(content.text);
        console.log(`[mcpCall] Parsed result keys:`, Object.keys(parsed));
        if (parsed.emails) console.log(`[mcpCall] Emails array length: ${parsed.emails.length}`);
        return parsed;
      } catch (jsonErr) {
        if (content.text.startsWith('Error:') || content.text.includes('error')) {
          throw new Error(content.text);
        }
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { force } = req.query;
    const forceRefresh = force === 'true';
    console.log(`📊 Daily Executive Email Briefing (ALL FOLDERS) - force: ${forceRefresh}...`);
    const startTime = Date.now();

    // Check Snowflake cache first (unless force refresh)
    if (!forceRefresh) {
      try {
        console.log('🔍 Checking Snowflake for cached results...');
        const today = new Date().toISOString().split('T')[0];

        const cacheQuery = `
          SELECT
            EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
            CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
            FOLDER, MAILBOX, RECEIVED_AT, PROCESSED_AT
          FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
          WHERE BRIEFING_DATE = '${today}'
          ORDER BY PROCESSED_AT DESC
        `;

        const cachedResults = await snowflakeCall(cacheQuery);

        if (cachedResults && cachedResults.length > 0) {
          // Check if results are fresh (< 24 hours old - same day cache is valid)
          const latestProcessed = new Date(cachedResults[0].PROCESSED_AT);
          const ageMinutes = (Date.now() - latestProcessed.getTime()) / 60000;

          console.log(`📦 Found ${cachedResults.length} cached results, age: ${ageMinutes.toFixed(1)} minutes`);

          if (ageMinutes < 1440) {
            console.log('✅ Using cached results (fresh)');

            // Transform Snowflake results to match expected format
            const emails = cachedResults.map(row => ({
              id: row.EMAIL_ID,
              subject: row.SUBJECT,
              from: row.FROM_NAME,
              from_email: row.FROM_EMAIL,
              preview: row.PREVIEW,
              category: row.CATEGORY,
              priority: row.PRIORITY,
              is_to_email: row.IS_TO_EMAIL,
              needs_response: row.NEEDS_RESPONSE,
              folder: row.FOLDER,
              mailbox: row.MAILBOX,
              received: row.RECEIVED_AT
            }));

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            return res.json({
              success: true,
              briefing_date: today,
              total_emails_reviewed: cachedResults.length,
              emails_requiring_attention: cachedResults.length,
              emails: emails,
              processing_time: `${elapsed}s`,
              message: `Reviewed ${cachedResults.length} emails (cached ${ageMinutes.toFixed(0)}m ago)`,
              cached: true,
              cache_age_minutes: Math.round(ageMinutes),
              last_processed: latestProcessed.toISOString()
            });
          } else {
            console.log(`⏰ Cached results too old (${ageMinutes.toFixed(0)} minutes > 24 hours), refreshing...`);
          }
        } else {
          console.log('📭 No cached results found, processing fresh...');
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache check failed, proceeding with fresh processing:', cacheError.message);
      }
    } else {
      console.log('🔄 Force refresh requested, bypassing cache');
    }

    // Folder priority order as specified
    const folderPriority = [
      // jstewart@middleground.com priority folders
      '02.1 Investor',
      '02.3 IB, Banks and Lenders',
      '02.4 CEO\'s',
      '02.05 Dechert',
      'Inbox',
      // john@middleground.com folders in order
      '01.01 Shelby',
      '01.02 Scot',
      '01.03 Chris',
      '01.04 Jackie',
      '01.06 Jon La',
      '01.07 Kelly',
      '01.08 Dave Eubank',
      '01.09 Ryan',
      '01.11 MP Office',
      '01.12 COO Office',
      '01.13 MC',
      '01.19 Exits and Capital Markets',
      '01.20 IR',
      '01.21 BD',
      '01.22 MC Accounting',
      '01.23 Fund Accounting',
      '01.24 N Transaction Team',
      '01.25 E Transaction Team',
      '01.26 N Operations Team',
      '01.27 E Operations Team',
      '01.28 Human Capital',
      '01.29 Marketing',
      '01.30 ESG',
      '01.31 Office Team',
      '01.33 Valuation',
      '01.34 Support',
      '01.35 IT',
      '01.36 Portfolio Legal'
    ];

    // Fetch emails directly from M365 from ALL priority folders (both read AND unread from TODAY + YESTERDAY)
    // Calculate yesterday at midnight in local time
    const now = new Date();
    const yesterdayMidnight = new Date(now);
    yesterdayMidnight.setDate(now.getDate() - 1);
    yesterdayMidnight.setHours(0, 0, 0, 0);

    console.log(`📧 Fetching emails from TODAY + YESTERDAY (since ${yesterdayMidnight.toISOString()})`);

    // ALL FOLDERS - Unified daily briefing (31 folders total)
    const mailboxConfig = {
      'jstewart@middleground.com': [
        'inbox',
        'AQMkADMyYzgxOTM1LTNiYgEtNGE3MC05YzRhLTE5YmVkOGIzZDViZQAuAAADdhdTXyCzwkW-9V25gTtkpAEAw75Tl4QJvkqd50mJZuw3ngAC11ZEOQAAAA==', // 02.2 Placement Agents
        'AQMkADMyYzgxOTM1LTNiYgEtNGE3MC05YzRhLTE5YmVkOGIzZDViZQAuAAADdhdTXyCzwkW-9V25gTtkpAEAw75Tl4QJvkqd50mJZuw3ngAC11ZEOgAAAA==', // 02.3 IB, Banks and Lenders
        'AQMkADMyYzgxOTM1LTNiYgEtNGE3MC05YzRhLTE5YmVkOGIzZDViZQAuAAADdhdTXyCzwkW-9V25gTtkpAEAw75Tl4QJvkqd50mJZuw3ngADe8C46wAAAA==', // 02.4 CEOs
        'AQMkADMyYzgxOTM1LTNiYgEtNGE3MC05YzRhLTE5YmVkOGIzZDViZQAuAAADdhdTXyCzwkW-9V25gTtkpAEAw75Tl4QJvkqd50mJZuw3ngAFtTzDqgAAAA==' // 02.05 Dechert
      ],
      'john@middleground.com': [
        'inbox',
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89uqQAAAA==', // 01.01 Shelby
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89urAAAAA==', // 01.02 Scot
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89urgAAAA==', // 01.03 Chris
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89urwAAAA==', // 01.04 Jackie
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89usgAAAA==', // 01.06 Jon La
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89uswAAAA==', // 01.07 Kelly
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89uuwAAAA==', // 01.08 Dave Eubank
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAAQEga-MAAA=', // 01.09 Ryan
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAACz3MI2AAA=', // 01.10 Executive Travel
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABs6hIqQAAAA==', // 01.11 MP Office (FIXED)
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2AKAAAAA==', // 01.12 COO Office (FIXED)
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2AKQAAAA==', // 01.13 MC (FIXED)
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQAEYWJ_ogAAAA==', // 01.19 Exit and capital markets
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyOAAA=', // 01.20 IR
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyNAAA=', // 01.21 BD
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyMAAA=', // 01.22 MC Accounting
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2AKgAAAA==', // 01.23 Fund Accounting
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyKAAA=', // 01.24 N Transaction Team
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2ALAAAAA==', // 01.25 E Transaction Team
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyLAAA=', // 01.26 N Operations Team
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2ALQAAAA==', // 01.27 E Operations Team
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyRAAA=', // 01.28 Human Capital
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyUAAA=', // 01.29 Marketing
        'AAMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAAAAAAgk0VHyOvbRaPMAcLLlPQLAQBtqPK5EteySrpFMqSnAflJAADFvIyPAAA=', // 01.30 ESG
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQABrR2AKwAAAA==', // 01.31 Office team
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADJrBF4QAAAA==', // 01.33 Valuation
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADJrBF4gAAAA==', // 01.34 Support
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89uugAAAA==', // 01.35 IT
        'AQMkADAyZGM5YmQ4LTI1YTctNDg5Ny1hY2ZhLTVmNDJhNmY0NWQ2MAAuAAADIJNFR8jr20WjzAHCy5T0CwEAbajyuRLXskq6RTKkpwH5SQADk89usQAAAA==' // 01.36 Portfolio legal
      ]
    };

    let allEmails = [];
    // Fetch from both mailboxes and all folders - PARALLELIZED for speed
    console.log(`📬 Fetching from ${Object.keys(mailboxConfig).length} mailboxes (${Object.values(mailboxConfig).flat().length} folders total) in parallel...`);

    const fetchPromises = [];
    for (const [mailbox, folders] of Object.entries(mailboxConfig)) {
      for (const folder of folders) {
        fetchPromises.push(
          mcpCall('m365_read_emails', {
            user: mailbox,
            folder: folder,
            unread_only: false,  // Get all emails, not just unread
            top: 100  // Limit for daily briefing (reduced from 500 for speed)
          }, 15000)  // 15s timeout per folder
          .then(emailsResponse => {
            if (emailsResponse.emails && Array.isArray(emailsResponse.emails)) {
              console.log(`  ✓ ${mailbox}/${folder.substring(0, 20)}...: ${emailsResponse.emails.length} emails`);
              // Tag each email with its source mailbox
              return emailsResponse.emails.map(email => ({
                ...email,
                _sourceMailbox: mailbox
              }));
            } else {
              console.log(`  ⚠ ${mailbox}/${folder.substring(0, 20)}...: No emails array`);
              return [];
            }
          })
          .catch(error => {
            console.error(`  ✗ Failed to fetch ${mailbox}/${folder.substring(0, 20)}...: ${error.message}`);
            return [];
          })
        );
      }
    }

    // Wait for all folder fetches to complete (with 40s overall timeout)
    const fetchTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Folder fetch timeout after 40s')), 40000)
    );

    try {
      const results = await Promise.race([
        Promise.all(fetchPromises),
        fetchTimeout
      ]);
      allEmails = results.flat();
    } catch (timeoutError) {
      console.error('⚠️ Folder fetch timeout - using partial results');
      // Collect whatever results we have so far
      const settled = await Promise.allSettled(fetchPromises);
      allEmails = settled
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .flat();
    }

    const rawFetchCount = allEmails.length;
    console.log(`\n📧 RAW TOTAL fetched from M365 (before any filtering): ${rawFetchCount} emails`);

    // Handle jstewart@middleground.com Focused inbox filtering
    // Mark and delete non-Focused emails from jstewart inbox
    const jstewartInboxEmails = allEmails.filter(e =>
      e._sourceMailbox === 'jstewart@middleground.com' &&
      (e.folder === 'inbox' || e.parentFolderId?.toLowerCase().includes('inbox'))
    );

    if (jstewartInboxEmails.length > 0) {
      console.log(`\n📬 Processing ${jstewartInboxEmails.length} jstewart inbox emails for Focused filtering...`);

      const otherEmails = jstewartInboxEmails.filter(e => {
        // M365 uses inferenceClassification: "focused" or "other"
        const classification = e.inferenceClassification?.toLowerCase();
        return classification === 'other' || (!classification && !e.categories?.includes('Focused'));
      });

      if (otherEmails.length > 0) {
        console.log(`🗑️  Found ${otherEmails.length} non-Focused emails in jstewart inbox - marking as read and deleting...`);

        const emailIdsToDelete = otherEmails.map(e => e.id);

        try {
          // Mark as read first
          await mcpCall('m365_mark_read', {
            message_ids: emailIdsToDelete,
            user: 'jstewart@middleground.com',
            is_read: true
          }, 20000);
          console.log(`✓ Marked ${emailIdsToDelete.length} emails as read`);

          // Delete (move to deleted items)
          await mcpCall('m365_delete_email', {
            message_ids: emailIdsToDelete,
            user: 'jstewart@middleground.com',
            permanent: false  // Move to deleted items, not permanent delete
          }, 20000);
          console.log(`✓ Deleted ${emailIdsToDelete.length} non-Focused emails from jstewart inbox`);

          // Remove from processing list
          allEmails = allEmails.filter(e => !emailIdsToDelete.includes(e.id));
          console.log(`✓ Removed ${emailIdsToDelete.length} emails from processing list`);
        } catch (error) {
          console.error(`❌ Failed to mark/delete non-Focused emails:`, error.message);
        }
      } else {
        console.log(`✓ All ${jstewartInboxEmails.length} jstewart inbox emails are Focused`);
      }
    }

    console.log(`\n📧 TOTAL fetched from all folders BEFORE date filter: ${allEmails.length}`);
    let sampleEmail = null;
    if (allEmails.length > 0) {
      sampleEmail = {
        subject: allEmails[0].subject,
        date: allEmails[0].date,
        receivedDateTime: allEmails[0].receivedDateTime,
        hasDateField: !!allEmails[0].date,
        hasReceivedDateTimeField: !!allEmails[0].receivedDateTime
      };
      console.log(`Sample email:`, JSON.stringify(allEmails[0], null, 2).substring(0, 500));
      console.log(`First email date field: ${allEmails[0].date}, receivedDateTime field: ${allEmails[0].receivedDateTime}`);
    }

    // Filter to TODAY + YESTERDAY - include both read and unread
    console.log(`\nDate cutoff (yesterday midnight): ${yesterdayMidnight.toISOString()}`);
    allEmails = allEmails.filter(email => {
      // M365 gateway returns 'date' field, not 'receivedDateTime'
      const receivedDate = email.date ? new Date(email.date) : (email.receivedDateTime ? new Date(email.receivedDateTime) : null);
      const passes = receivedDate && receivedDate >= yesterdayMidnight;
      if (!passes && allEmails.indexOf(email) < 3) {
        console.log(`  Email filtered out: ${email.subject?.substring(0, 40)}, date: ${email.date || email.receivedDateTime}, parsed: ${receivedDate?.toISOString()}`);
      }
      return passes;
    });

    console.log(`📧 Total after TODAY+YESTERDAY filter: ${allEmails.length} emails`);
    console.log(`📊 Read vs Unread breakdown:`);
    const readCount = allEmails.filter(e => e.isRead).length;
    const unreadCount = allEmails.filter(e => !e.isRead).length;
    console.log(`   - Read: ${readCount}`);
    console.log(`   - Unread: ${unreadCount}`);

    // SPAM DETECTION - Remove obvious spam/junk before processing
    console.log(`\n🗑️ Running spam detection...`);
    let spamCount = 0;
    const spamKeywords = [
      'unsubscribe', 'click here', 'act now', 'limited time', 'viagra', 'cialis',
      'weight loss', 'lose weight', 'make money', 'work from home', 'nigerian prince',
      'lottery', 'congratulations', 'you won', 'claim your prize', 'free money',
      'casino', 'poker', 'dating', 'singles', 'hot singles'
    ];

    const emailsToDelete = [];
    allEmails = allEmails.filter(email => {
      const subject = (email.subject || '').toLowerCase();
      const from = (email.from || '').toLowerCase();
      const preview = (email.preview || email.bodyPreview || '').toLowerCase();

      // Check for spam indicators
      const hasSpamKeyword = spamKeywords.some(keyword =>
        subject.includes(keyword) || preview.includes(keyword)
      );

      // Check for suspicious sender patterns
      const suspiciousSender = from.includes('noreply@') &&
        !from.includes('middleground.com') &&
        !from.includes('@microsoft.com') &&
        !from.includes('@asana.com');

      const isSpam = hasSpamKeyword || suspiciousSender;

      if (isSpam) {
        spamCount++;
        emailsToDelete.push({
          id: email.id,
          mailbox: email._sourceMailbox,
          subject: email.subject
        });
        console.log(`  🗑️ SPAM: ${email.subject?.substring(0, 60)}`);
      }

      return !isSpam;
    });

    // Delete spam emails in batches by mailbox
    const spamByMailbox = {};
    emailsToDelete.forEach(spam => {
      if (!spamByMailbox[spam.mailbox]) spamByMailbox[spam.mailbox] = [];
      spamByMailbox[spam.mailbox].push(spam.id);
    });

    for (const [mailbox, ids] of Object.entries(spamByMailbox)) {
      try {
        await mcpCall('m365_delete_email', {
          message_ids: ids,
          user: mailbox
        }, 10000);
        console.log(`  ✓ Deleted ${ids.length} spam emails from ${mailbox}`);
      } catch (deleteError) {
        console.error(`  ✗ Failed to delete spam from ${mailbox}:`, deleteError.message);
      }
    }

    console.log(`✅ Spam detection complete: ${spamCount} spam emails removed`);
    console.log(`📧 Remaining after spam filter: ${allEmails.length} emails`);

    if (allEmails.length === 0) {
      return res.json({
        success: true,
        briefing_date: new Date().toISOString().split('T')[0],
        total_emails_reviewed: 0,
        emails_requiring_attention: 0,
        emails: [],
        message: 'No emails found',
        debug: {
          cutoff_date_yesterday_midnight: yesterdayMidnight.toISOString(),
          raw_fetch_count: rawFetchCount,
          after_filter_count: 0,
          sample_email: sampleEmail
        }
      });
    }

    // Process in batches of 20 emails - AI will decide which need attention
    const BATCH_SIZE = 20;
    const briefingEmails = [];
    const batchErrors = [];
    let totalReviewed = 0;

    for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
      const batch = allEmails.slice(i, i + BATCH_SIZE);

      console.log(`\nBatch ${Math.floor(i/BATCH_SIZE) + 1}: Reviewing ${batch.length} emails...`);

      // Build email summaries for AI
      const emailSummaries = batch.map((email, idx) => {
        // M365 MCP server returns simplified fields, not full Graph API structure
        // Sanitize text to prevent JSON parsing issues
        const sanitize = (text) => text ? text.replace(/[\r\n\t]/g, ' ').replace(/"/g, "'").substring(0, 200) : '';

        // Extract from field - M365 MCP returns from_name and from as separate fields
        const from_name = sanitize(email.from_name || email.from || 'Unknown');
        const from_email = sanitize(email.from || 'unknown');
        const subject = sanitize(email.subject || 'No subject');
        const preview = sanitize(email.preview || email.bodyPreview || email.snippet || 'No preview');
        const receivedDate = email.date || email.receivedDateTime;

        return `${idx + 1}. ID: ${email.id}
   From: ${from_name} <${from_email}>
   Subject: ${subject}
   Preview: ${preview}
   Received: ${receivedDate ? new Date(receivedDate).toLocaleDateString() : 'Unknown'}`;
      }).join('\n\n');

      const briefingPrompt = `CRITICAL: Categorize ALL ${batch.length} emails below for John Stewart (Managing Partner at Middleground Capital).

${emailSummaries}

IMPORTANT: You MUST return exactly ${batch.length} results - one for EACH email above. Do not skip any emails.

For each email, determine:
1. priority: "urgent" (time-sensitive/critical), "high" (important), "medium" (normal), or "fyi" (informational only)
2. is_to_email: true if John is in To: line, false if CC
3. needs_response: true if requires John's action/response, false if just FYI

Categorization rules:
- Portfolio company CEOs/CFOs = high priority
- Investors, placement agents, banks, lenders = high priority
- Legal (Dechert, etc.) = high priority
- Internal team emails TO John = medium priority (unless urgent matter)
- CC emails = usually fyi priority unless specifically asks John to do something
- Automated notifications/receipts = fyi priority

Return ONLY a JSON array with exactly ${batch.length} objects (no markdown, no explanation):
[
  {
    "id": "email_id_from_above",
    "priority": "high",
    "is_to_email": true,
    "needs_response": true
  },
  ...
]`;

      // Check if approaching timeout (leave 10s buffer for final operations)
      const elapsedSoFar = (Date.now() - startTime) / 1000;
      if (elapsedSoFar > 80) {
        console.warn(`⏱️ Approaching timeout (${elapsedSoFar}s elapsed) - stopping batch processing`);
        break;
      }

      let aiText = '';
      try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;

        // Create abort controller for AI timeout
        const aiController = new AbortController();
        const aiTimeoutId = setTimeout(() => aiController.abort(), 30000); // 30s timeout for AI

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            temperature: 0.3,
            messages: [{ role: 'user', content: briefingPrompt }]
          }),
          signal: aiController.signal
        });

        clearTimeout(aiTimeoutId);

        if (!aiRes.ok) {
          throw new Error(`AI API returned ${aiRes.status}`);
        }

        const aiData = await aiRes.json();
        aiText = aiData.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        console.log(`[AI Response] First 500 chars: ${aiText.substring(0, 500)}`);
        console.log(`[AI Response] Last 500 chars: ${aiText.substring(Math.max(0, aiText.length - 500))}`);

        const results = JSON.parse(aiText);

        console.log(`  AI reviewed ${results.length} emails`);

        // Validation: Warn if AI didn't return all results
        if (results.length !== batch.length) {
          console.warn(`  ⚠️ WARNING: AI returned ${results.length} results but batch had ${batch.length} emails!`);
          console.warn(`  Missing ${batch.length - results.length} email categorizations`);
        }

        // Process results - categorize ALL emails
        // Batch M365 operations by mailbox for efficiency
        const toFlag = [];
        const toMarkRead = [];
        const toCategorize = { 'jstewart@middleground.com': [], 'john@middleground.com': [] };

        for (const result of results) {
          const email = batch.find(e => e.id === result.id);
          if (!email) {
            console.warn(`  ⚠️ AI returned result for unknown email ID: ${result.id}`);
            continue;
          }

          totalReviewed++;

          const folder = folderPriority.find(f => email.parentFolderId?.includes(f)) || 'Other';

          // Determine category based on priority, TO/CC, and needs response
          let category;
          if (result.priority === 'urgent' || result.priority === 'high') {
            category = 'Urgent/Priority';
          } else if (result.priority === 'fyi') {
            category = result.is_to_email ? 'To: FYI' : 'CC: FYI';
          } else {
            // Medium priority
            if (result.is_to_email) {
              category = result.needs_response ? 'To: Need Response/Action' : 'To: FYI';
            } else {
              category = result.needs_response ? 'CC: Need Response/Action' : 'CC: FYI';
            }
          }

          // Extract from field - M365 MCP returns from_name and from as separate fields
          const fromName = email.from_name || email.from || 'Unknown';
          const fromEmail = email.from || 'unknown';

          briefingEmails.push({
            id: result.id,
            folder: folder,
            from: fromName,
            from_email: fromEmail,
            subject: email.subject,
            received: email.date || email.receivedDateTime,
            preview: email.preview || email.bodyPreview || email.snippet,
            priority: result.priority,
            is_to_email: result.is_to_email,
            needs_response: result.needs_response,
            category: category,
            mailbox: email._sourceMailbox
          });

          console.log(`    ✓ ${category}: ${email.subject?.substring(0, 40)}`);

          const emailMailbox = email._sourceMailbox || 'jstewart@middleground.com';

          // Collect operations to batch
          if (toCategorize[emailMailbox]) {
            toCategorize[emailMailbox].push({ id: result.id, category });
          }

          if (result.priority === 'urgent' || (result.priority === 'high' && result.needs_response)) {
            toFlag.push({ id: result.id, mailbox: emailMailbox });
          }

          if (!result.needs_response && result.priority === 'fyi') {
            toMarkRead.push({ id: result.id, mailbox: emailMailbox });
          }
        }

        // Execute batched operations (non-blocking - don't wait)
        const batchOps = [];

        // Categorize in batches by mailbox
        for (const [mailbox, items] of Object.entries(toCategorize)) {
          if (items.length > 0) {
            // Group by category for efficient batch operations
            const byCategory = {};
            items.forEach(item => {
              if (!byCategory[item.category]) byCategory[item.category] = [];
              byCategory[item.category].push(item.id);
            });

            for (const [category, ids] of Object.entries(byCategory)) {
              batchOps.push(
                mcpCall('m365_set_categories', {
                  message_ids: ids,
                  categories: ['Processed', category],
                  user: mailbox
                }, 5000).catch(err => console.error(`    ⚠️ Categorize error: ${err.message}`))
              );
            }
          }
        }

        // Flag emails by mailbox
        const flagByMailbox = {};
        toFlag.forEach(item => {
          if (!flagByMailbox[item.mailbox]) flagByMailbox[item.mailbox] = [];
          flagByMailbox[item.mailbox].push(item.id);
        });

        for (const [mailbox, ids] of Object.entries(flagByMailbox)) {
          for (const id of ids) {
            batchOps.push(
              mcpCall('m365_flag_email', {
                message_id: id,
                flag_status: 'flagged',
                user: mailbox
              }, 5000).catch(err => console.error(`    ⚠️ Flag error: ${err.message}`))
            );
          }
        }

        // Mark as read by mailbox
        const readByMailbox = {};
        toMarkRead.forEach(item => {
          if (!readByMailbox[item.mailbox]) readByMailbox[item.mailbox] = [];
          readByMailbox[item.mailbox].push(item.id);
        });

        for (const [mailbox, ids] of Object.entries(readByMailbox)) {
          batchOps.push(
            mcpCall('m365_mark_read', {
              message_ids: ids,
              is_read: true,
              user: mailbox
            }, 5000).catch(err => console.error(`    ⚠️ Mark read error: ${err.message}`))
          );
        }

        // Execute all batch operations in parallel (don't wait for completion)
        if (batchOps.length > 0) {
          Promise.all(batchOps).catch(() => {}); // Fire and forget
        }

      } catch (batchError) {
        console.error(`  ❌ Batch failed: ${batchError.message}`);
        console.error(`  ❌ Full error:`, batchError);
        // Add error details to debug info - capture AI response for JSON parse errors
        const errorInfo = {
          batch: Math.floor(i/BATCH_SIZE) + 1,
          error: batchError.message,
          stack: batchError.stack?.substring(0, 200)
        };
        // If it's a JSON parse error and we have aiText, include a sample
        if (batchError.message.includes('JSON') && typeof aiText !== 'undefined') {
          errorInfo.ai_response_sample = aiText.substring(Math.max(0, 6100), 6200);
        }
        batchErrors.push(errorInfo);
      }
    }

    // Sort briefing emails by priority
    briefingEmails.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Briefing complete in ${elapsed}s: ${briefingEmails.length} emails need attention (${totalReviewed} reviewed)`);

    // Save results to Snowflake for instant future loads
    try {
      console.log('💾 Saving results to Snowflake...');
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Cleanup old records (> 7 days)
      const cleanupQuery = `
        DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
        WHERE BRIEFING_DATE < '${sevenDaysAgo}'
      `;
      await snowflakeCall(cleanupQuery);
      console.log('🗑️ Cleaned up records older than 7 days');

      // Delete existing records for today (refresh)
      const deleteQuery = `
        DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
        WHERE BRIEFING_DATE = '${today}'
      `;
      await snowflakeCall(deleteQuery);
      console.log(`🗑️ Cleared existing records for today`);

      // Insert new records
      if (briefingEmails.length > 0) {
        const values = briefingEmails.map(email => {
          const escapeSql = (str) => str ? str.replace(/'/g, "''").substring(0, 2000) : '';
          return `(
            '${email.id}',
            '${escapeSql(email.subject)}',
            '${escapeSql(email.from)}',
            '${escapeSql(email.from_email)}',
            '${escapeSql(email.preview)}',
            '${email.category}',
            '${email.priority}',
            ${email.is_to_email},
            ${email.needs_response},
            '${escapeSql(email.folder)}',
            '${email.mailbox}',
            1,
            '${email.received}',
            CURRENT_TIMESTAMP(),
            '${today}'
          )`;
        }).join(',\n');

        const insertQuery = `
          INSERT INTO SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS (
            EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
            CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
            FOLDER, MAILBOX, TIER, RECEIVED_AT, PROCESSED_AT, BRIEFING_DATE
          ) VALUES ${values}
        `;

        await snowflakeCall(insertQuery);
        console.log(`✅ Saved ${briefingEmails.length} emails to Snowflake`);
      }
    } catch (saveError) {
      console.error('⚠️ Failed to save to Snowflake (non-fatal):', saveError.message);
      console.error('Full error:', saveError);
    }

    return res.json({
      success: true,
      briefing_date: new Date().toISOString().split('T')[0],
      total_emails_reviewed: totalReviewed,
      emails_requiring_attention: briefingEmails.length,
      emails: briefingEmails,
      processing_time: `${elapsed}s`,
      message: `Reviewed ${totalReviewed} emails, ${briefingEmails.length} require your attention`,
      debug: {
        cutoff_date_yesterday_midnight: yesterdayMidnight.toISOString(),
        raw_fetch_count: rawFetchCount,
        after_filter_count: allEmails.length,
        sample_email: sampleEmail,
        batch_size: 20,
        expected_batches: Math.ceil(allEmails.length / 20),
        batch_errors: batchErrors
      }
    });

  } catch (error) {
    console.error('❌ Daily briefing error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate briefing'
    });
  }
}
