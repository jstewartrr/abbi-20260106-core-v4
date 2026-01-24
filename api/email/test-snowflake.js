// Test Snowflake connection and response format
const SNOWFLAKE_GATEWAY = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Test a simple query
    const testQuery = `SELECT CURRENT_DATE() as today, CURRENT_TIMESTAMP() as now`;

    console.log('Testing Snowflake query:', testQuery);

    const response = await fetch(SNOWFLAKE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'query_snowflake',
          arguments: { sql: testQuery }
        },
        id: Date.now()
      })
    });

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    const data = JSON.parse(responseText);
    console.log('Parsed response:', JSON.stringify(data, null, 2));

    return res.json({
      success: true,
      raw_response: data,
      content: data.result?.content,
      parsed_content: data.result?.content?.[0]?.type === 'text'
        ? JSON.parse(data.result.content[0].text)
        : null
    });

  } catch (error) {
    console.error('Snowflake test error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
