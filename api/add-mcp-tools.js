// Add MCP tools to ElevenLabs agent configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const agentId = req.query.agent_id || 'agent_2501ketq01k7e4vrnbrvvefa99ej';

  // Start with Snowflake tool only (confirmed working)
  const mcpTools = [
    {
      name: 'query_snowflake',
      description: 'Execute SQL query on Sovereign Mind Snowflake database. Use this to query the Hive Mind (SOVEREIGN_MIND.HIVE_MIND.ENTRIES), projects, tasks, or any other data in the database.',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'query_snowflake',
        arguments: {
          sql: 'REQUIRED: SQL query string'
        }
      }
    }
  ];

  try {
    // Get current agent configuration
    const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!getResponse.ok) {
      throw new Error(`Failed to get agent: ${getResponse.status}`);
    }

    const agent = await getResponse.json();

    // Add MCP tools to existing custom tools
    const existingTools = agent.conversation_config?.client_tools?.tools || [];
    const existingToolNames = new Set(existingTools.map(t => t.name));

    // Only add tools that don't already exist
    const newTools = mcpTools.filter(tool => !existingToolNames.has(tool.name));
    const updatedTools = [...existingTools, ...newTools];

    // Update agent with new tools
    const updateResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_config: {
          ...agent.conversation_config,
          client_tools: {
            ...agent.conversation_config?.client_tools,
            tools: updatedTools
          }
        }
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update agent: ${updateResponse.status} - ${errorText}`);
    }

    const updatedAgent = await updateResponse.json();

    return res.json({
      success: true,
      agent_id: agentId,
      tools_added: newTools.length,
      total_tools: updatedTools.length,
      new_tools: newTools.map(t => t.name),
      message: `Successfully added ${newTools.length} MCP tools to agent`
    });

  } catch (error) {
    console.error('Error adding MCP tools:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
