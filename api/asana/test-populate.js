// Quick test endpoint to populate sample Asana tasks for testing
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60,
};

async function mcpCall(tool, args = {}) {
  const res = await fetch(SNOWFLAKE_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    if (content.text.startsWith('Error:')) {
      throw new Error(content.text);
    }
    return JSON.parse(content.text);
  }
  return content;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    console.log('Creating sample Asana tasks...');

    // Create table if it doesn't exist
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS (
          TASK_GID VARCHAR(50) PRIMARY KEY,
          TASK_NAME VARCHAR(500) NOT NULL,
          PROJECT VARCHAR(200),
          ASSIGNEE_NAME VARCHAR(200),
          ASSIGNEE_GID VARCHAR(50),
          DUE_DATE DATE,
          CATEGORY VARCHAR(50),
          SECTION VARCHAR(200),
          COMPLETED BOOLEAN DEFAULT FALSE,
          AI_SUMMARY VARCHAR(5000),
          DRAFT_COMMENT VARCHAR(5000),
          ACTION_PLAN VARCHAR(5000),
          PRIORITY_ASSESSMENT VARCHAR(1000),
          BLOCKERS VARCHAR(5000),
          SUBTASKS_JSON VARCHAR(10000),
          COMMENTS_JSON VARCHAR(10000),
          ATTACHMENTS_JSON VARCHAR(10000),
          PERMALINK_URL VARCHAR(500),
          PROCESSED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
      )
    `;

    await mcpCall('sm_query_snowflake', { sql: createTableSQL });
    console.log('✓ Table created/verified');

    // Clear existing data
    await mcpCall('sm_query_snowflake', {
      sql: 'DELETE FROM SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS'
    });
    console.log('✓ Cleared old data');

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Sample tasks
    const tasks = [
      {
        gid: '1001', name: 'Review Q4 Portfolio Performance', project: 'MP Project Dashboard',
        assignee: 'John Stewart', assignee_gid: '373563475019846', due_date: today,
        category: 'My Tasks Due Today', section: 'Strategic Initiatives',
        summary: 'Quarterly review of all portfolio companies. PACE showing strong EBITDA growth (+12%), Shiloh on track with cost reduction initiatives. IT8 exceeded revenue targets by 8%. Need to discuss follow-on investment opportunities.',
        subtasks: '[{"name":"Review financial dashboards","completed":true},{"name":"Prepare board presentation","completed":false}]',
        comments: '[{"created_by":{"name":"Sarah Williams"},"text":"Financial data ready for review"}]'
      },
      {
        gid: '1002', name: 'Fund III LP Commitment Follow-up', project: 'Johns Weekly Items',
        assignee: 'John Stewart', assignee_gid: '373563475019846', due_date: yesterday,
        category: 'My Tasks Past Due', section: 'Fundraising',
        summary: 'Follow up with sovereign wealth fund on $50M commitment. They requested additional due diligence materials on ESG practices and portfolio company performance metrics. IC approved terms last week.',
        subtasks: '[{"name":"Prepare ESG report","completed":true},{"name":"Schedule call","completed":false}]',
        comments: '[]'
      },
      {
        gid: '1003', name: 'Prepare IC Presentation - Xtrac Deal', project: 'MP Project Dashboard',
        assignee: 'Michael Chen', assignee_gid: '999999999', due_date: today,
        category: 'Delegated Tasks Due Today', section: 'Deal Pipeline',
        summary: 'Michael is preparing the Investment Committee presentation for Xtrac Manufacturing acquisition. Deal size: $45M, 15x EBITDA multiple. Strong industrial automation sector tailwinds.',
        subtasks: '[{"name":"Complete financial model","completed":true},{"name":"Draft investment memo","completed":false},{"name":"Prepare management Q&A","completed":false}]',
        comments: '[{"created_by":{"name":"Michael Chen"},"text":"Financial model complete, need your feedback on valuation assumptions"}]'
      },
      {
        gid: '1004', name: 'Complete Due Diligence on Apex Components', project: 'Johns Weekly Items',
        assignee: 'David Park', assignee_gid: '888888888', due_date: yesterday,
        category: 'Delegated Tasks Past Due', section: 'Deal Pipeline',
        summary: 'David was leading due diligence on Apex Components acquisition. Customer concentration risk identified (top 3 customers = 65% of revenue). Need management plan to diversify customer base before IC approval.',
        subtasks: '[{"name":"Site visit","completed":true},{"name":"Customer interviews","completed":true},{"name":"Final diligence report","completed":false}]',
        comments: '[{"created_by":{"name":"David Park"},"text":"Completed site visit and customer interviews. Working on final report but need more time due to customer concentration concerns"}]'
      },
      {
        gid: '1005', name: 'Board Meeting Preparation - PACE Industries', project: 'MP Project Dashboard',
        assignee: 'John Stewart', assignee_gid: '373563475019846', due_date: tomorrow,
        category: 'My Tasks Due Today', section: 'Board Governance',
        summary: 'Quarterly board meeting for PACE Industries next week. Revenue miss of 8% vs plan but EBITDA margins improved by 2pts. Need to discuss pricing strategy and new business development initiatives.',
        subtasks: '[{"name":"Review financials","completed":false},{"name":"Meet with CEO","completed":false}]',
        comments: '[]'
      }
    ];

    // Insert tasks
    for (const task of tasks) {
      const insertSQL = `
        INSERT INTO SOVEREIGN_MIND.RAW.ASANA_TASK_ANALYSIS (
          TASK_GID, TASK_NAME, PROJECT, ASSIGNEE_NAME, ASSIGNEE_GID, DUE_DATE,
          CATEGORY, SECTION, COMPLETED, AI_SUMMARY, DRAFT_COMMENT, ACTION_PLAN,
          PRIORITY_ASSESSMENT, BLOCKERS, SUBTASKS_JSON, COMMENTS_JSON,
          ATTACHMENTS_JSON, PERMALINK_URL, PROCESSED_AT
        ) VALUES (
          '${task.gid}',
          '${task.name.replace(/'/g, "''")}',
          '${task.project}',
          '${task.assignee}',
          '${task.assignee_gid}',
          '${task.due_date}',
          '${task.category}',
          '${task.section}',
          FALSE,
          '${task.summary.replace(/'/g, "''")}',
          'Please provide an update on the current status and next steps',
          '["Complete outstanding items","Provide status update"]',
          'High - This task requires immediate attention and has business impact',
          '[]',
          '${task.subtasks}',
          '${task.comments}',
          '[]',
          'https://app.asana.com/0/${task.gid}',
          CURRENT_TIMESTAMP()
        )
      `;

      await mcpCall('sm_query_snowflake', { sql: insertSQL });
    }

    console.log(`✓ Inserted ${tasks.length} sample tasks`);

    return res.json({
      success: true,
      message: 'Sample tasks populated successfully',
      tasks_inserted: tasks.length,
      note: 'These are sample tasks for testing. Run /api/asana/triage-tasks to populate with real Asana data.'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
