// Simple API to fetch triaged emails from Hive Mind via Snowflake + calendar events from M365
// Version: 2.1.6 - Use MCP load balancer with correct credentials
const MCP_GATEWAY = 'https://mcp.abbi-ai.com/mcp';

export default async function handler(req, res) {
  // Set cache control headers to prevent caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-API-Version', '2.1.6');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch emails and calendar in parallel
    const [snowflakeResponse, calendarResponse] = await Promise.all([
      // Query Hive Mind table directly via Snowflake
      fetch(MCP_GATEWAY, {
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
      fetch(MCP_GATEWAY, {
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

    // Check for MCP error
    if (snowflakeData.error) {
      console.error('Snowflake MCP error:', snowflakeData.error);
      throw new Error(`Snowflake error: ${snowflakeData.error.message || JSON.stringify(snowflakeData.error)}`);
    }

    const content = snowflakeData.result?.content?.[0];

    if (!content || content.type !== 'text') {
      console.error('Invalid Snowflake response structure:', JSON.stringify(snowflakeData).substring(0, 500));
      throw new Error('Invalid Snowflake response');
    }

    console.log('Snowflake content.text:', content.text.substring(0, 200));

    let results;
    try {
      results = JSON.parse(content.text);
    } catch (parseError) {
      console.error('Failed to parse Snowflake response:', content.text);

      // Check if it's an "Unknown tool" error from the gateway
      if (content.text.includes('Error: Unknown tool')) {
        throw new Error('MCP gateway error: The sm_query_snowflake tool is not available. This may be a temporary gateway issue. Please refresh in a few seconds.');
      }

      throw new Error(`Snowflake returned invalid JSON: ${content.text.substring(0, 100)}`);
    }

    if (!results.success || !results.data) {
      console.error('Snowflake query failed:', results.error);
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
