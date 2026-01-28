// Simple API to fetch triaged emails from Hive Mind via Snowflake + calendar events from M365
// Version: 2.2.1 - Use proven mcpCall helper from debug-executive.js
const SNOWFLAKE_MCP = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const M365_MCP = 'https://mcp.abbi-ai.com/mcp';

// Helper function - copied from debug-executive.js (known working)
async function mcpCall(url, tool, args = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: Date.now() })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const content = data.result?.content?.[0];
  return content?.type === 'text' ? JSON.parse(content.text) : content;
}

export default async function handler(req, res) {
  // Set cache control headers to prevent caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-API-Version', '2.3.0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== API v2.3.0 - Fetching triaged emails using mcpCall ===');
    console.log('Snowflake MCP:', SNOWFLAKE_MCP);

    // Fetch emails and calendar in parallel using mcpCall helper
    const [results, calendarResults] = await Promise.all([
      // Query Hive Mind table directly via Snowflake
      mcpCall(SNOWFLAKE_MCP, 'sm_query_snowflake', {
        sql: `SELECT DETAILS, SUMMARY, PRIORITY, CREATED_AT
              FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
              WHERE CATEGORY = 'triaged_email'
                AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)
              ORDER BY CREATED_AT DESC
              LIMIT 100`
      }),
      // Fetch calendar events from M365 (today and tomorrow)
      mcpCall(M365_MCP, 'm365_list_calendar_events', {
        user: 'jstewart@middleground.com',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      })
    ]);

    if (!results.success) {
      throw new Error(results.error || 'Snowflake query failed');
    }

    if (!results.data || results.data.length === 0) {
      console.log('No triaged emails found');
    }

    // Extract calendar events from response
    const calendarEvents = calendarResults.events || calendarResults.value || [];

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
