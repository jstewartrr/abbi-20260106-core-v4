// Simple API to fetch triaged emails from Hive Mind via Snowflake + calendar events from M365
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch emails and calendar in parallel
    const [snowflakeResponse, calendarResponse] = await Promise.all([
      // Query Hive Mind table directly via Snowflake
      fetch(SNOWFLAKE_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'sm_query_snowflake',
            arguments: {
              sql: `SELECT DETAILS, SUMMARY, PRIORITY, CREATED_AT
                    FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
                    WHERE CATEGORY = 'triaged_email'
                      AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)
                    ORDER BY CREATED_AT DESC
                    LIMIT 100`
            }
          },
          id: 1
        })
      }),
      // Fetch calendar events from M365 (today and tomorrow)
      fetch(SNOWFLAKE_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'm365_list_calendar_events',
            arguments: {
              user: 'jstewart@middleground.com',
              start_date: new Date().toISOString().split('T')[0],
              end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            }
          },
          id: 2
        })
      })
    ]);

    if (!snowflakeResponse.ok) {
      throw new Error(`Snowflake error: ${snowflakeResponse.statusText}`);
    }

    const snowflakeData = await snowflakeResponse.json();
    const content = snowflakeData.result?.content?.[0];

    if (!content || content.type !== 'text') {
      throw new Error('Invalid Snowflake response');
    }

    const results = JSON.parse(content.text);

    if (!results.success || !results.data) {
      throw new Error(results.error || 'No data returned from Hive Mind');
    }

    // Parse calendar response
    let calendarEvents = [];
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const calendarContent = calendarData.result?.content?.[0];
      if (calendarContent && calendarContent.type === 'text') {
        const calendarResults = JSON.parse(calendarContent.text);
        calendarEvents = calendarResults.events || calendarResults.value || [];
      }
    }

    // Transform Hive Mind entries to email format expected by dashboard
    const emails = results.data.map(row => {
      const data = typeof row.DETAILS === 'string' ? JSON.parse(row.DETAILS) : (row.DETAILS || {});

      // Determine category based on classification, priority, and tag
      let category;
      if (data.priority === 'HIGH') {
        category = 'Urgent/Priority';
      } else if (data.classification === 'To:' && data.tag === 'Needs Response') {
        category = 'To: Need Response/Action';
      } else if (data.classification === 'To:' && data.tag === 'FYI') {
        category = 'To: FYI';
      } else if (data.classification === 'CC:' && data.tag === 'Needs Response') {
        category = 'CC: Need Response/Action';
      } else if (data.classification === 'CC:' && data.tag === 'FYI') {
        category = 'CC: FYI';
      } else {
        category = 'To: FYI'; // default
      }

      return {
        id: data.email_id || data.outlook_message_id,
        outlook_message_id: data.outlook_message_id,
        subject: data.subject,
        from: data.from_name || data.from_email,
        from_name: data.from_name,
        from_email: data.from_email,
        folder: data.folder_name,
        folder_name: data.folder_name,
        received_at: data.received_at,
        classification: data.classification,
        priority: data.priority,
        tag: data.tag,
        category: category,
        summary: data.summary,
        action_items: data.action_items || [],
        attachments: data.attachments || [],
        conversation_context: data.conversation_context,
        has_attachments: data.has_attachments,
        processed_at: data.processed_at,
        to_recipients: data.to_recipients || [],
        cc_recipients: data.cc_recipients || []
      };
    });

    return res.json({
      success: true,
      emails: emails,
      calendar: calendarEvents,
      total_emails: emails.length,
      emails_requiring_attention: emails.filter(e => e.tag === 'Needs Response').length,
      emails_reviewed: emails.length,
      cached: false
    });

  } catch (error) {
    console.error('Error fetching triaged emails:', error);
    return res.status(500).json({
      error: 'Failed to fetch triaged emails',
      details: error.message
    });
  }
}
