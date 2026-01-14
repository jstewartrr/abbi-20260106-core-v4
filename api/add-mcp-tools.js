// Add MCP tools to ElevenLabs agent configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const agentId = req.query.agent_id || 'agent_2501ketq01k7e4vrnbrvvefa99ej';

  // All MCP tools for ABBI
  const mcpTools = [
    {
      name: 'read_hive_mind',
      description: 'Read recent entries from Hive Mind. Returns the last 5-20 entries with category, source, summary, priority, workstream, and timestamps.',
      url: 'https://abbi-ai.com/api/tools/read-hive-mind',
      body: {
        limit: 5
      }
    },
    {
      name: 'search_hive_mind',
      description: 'Search Hive Mind entries by keyword or category. Use this to find specific information or topics in the knowledge base.',
      url: 'https://abbi-ai.com/api/tools/search-hive-mind',
      body: {
        query: 'REQUIRED: Search query string',
        category: 'Optional: Filter by category'
      }
    },
    {
      name: 'write_hive_mind',
      description: 'Write a new entry to Hive Mind. Use this to save important information, decisions, or context for future reference.',
      url: 'https://abbi-ai.com/api/tools/write-hive-mind',
      body: {
        category: 'REQUIRED: Entry category',
        summary: 'REQUIRED: Entry content',
        priority: 'Optional: Priority level',
        workstream: 'Optional: Related workstream'
      }
    },
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

    // Verify tools were actually added
    const verifyTools = updatedAgent.conversation_config?.client_tools?.tools || [];

    return res.json({
      success: true,
      agent_id: agentId,
      tools_added: newTools.length,
      total_tools: updatedTools.length,
      verified_tools: verifyTools.length,
      new_tools: newTools.map(t => t.name),
      message: `Successfully added ${newTools.length} MCP tools to agent`,
      debug: {
        before_tools: existingTools.length,
        after_tools: verifyTools.length,
        update_response_status: updateResponse.status
      }
    });

  } catch (error) {
    console.error('Error adding MCP tools:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
