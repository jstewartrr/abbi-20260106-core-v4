// ElevenLabs Custom Tool: Generic MCP Tool Caller
// Allows ABBI to call any tool from direct MCP servers
// Routes to correct MCP server based on tool name

const MCP_ENDPOINTS = {
  // Snowflake database
  'query_snowflake': 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp',

  // Azure CLI
  'azure_cli': 'https://cv-sm-azure-cli-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp',

  // Default fallback
  'default': 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tool_name, arguments: toolArgs = {} } = req.body;

    if (!tool_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: tool_name'
      });
    }

    // Determine which MCP endpoint to use based on tool name
    const mcpEndpoint = MCP_ENDPOINTS[tool_name] || MCP_ENDPOINTS['default'];

    // Call the MCP tool
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: tool_name,
          arguments: toolArgs
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({
        success: false,
        error: data.error.message || 'MCP tool call failed',
        details: data.error
      });
    }

    if (data.result) {
      return res.json({
        success: true,
        tool_name,
        result: data.result
      });
    }

    return res.json({
      success: false,
      error: 'Unexpected MCP response format',
      raw_response: data
    });

  } catch (error) {
    console.error('MCP call error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to execute MCP tool'
    });
  }
}
