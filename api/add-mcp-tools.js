// Add MCP tools to ElevenLabs agent configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const agentId = req.query.agent_id || 'agent_2501ketq01k7e4vrnbrvvefa99ej';

  // Define the most useful MCP tools for ABBI
  const mcpTools = [
    {
      name: 'query_snowflake',
      description: 'Execute SQL query on Sovereign Mind Snowflake database',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'sm_query_snowflake',
        arguments: {
          sql: 'REQUIRED: SQL query string'
        }
      }
    },
    {
      name: 'search_google_drive',
      description: 'Search files in Google Drive by name or content',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'drive_search_files',
        arguments: {
          query: 'REQUIRED: Search query string'
        }
      }
    },
    {
      name: 'read_drive_file',
      description: 'Read text content from a Google Drive file',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'drive_read_text_file',
        arguments: {
          file_id: 'REQUIRED: Google Drive file ID'
        }
      }
    },
    {
      name: 'list_asana_tasks',
      description: 'List tasks from Asana with optional filters',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'asana_list_tasks',
        arguments: {
          project_id: 'Optional: Project ID to filter',
          completed: false
        }
      }
    },
    {
      name: 'create_asana_task',
      description: 'Create a new task in Asana',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'asana_create_task',
        arguments: {
          name: 'REQUIRED: Task name',
          notes: 'Optional: Task description'
        }
      }
    },
    {
      name: 'read_emails',
      description: 'Read recent emails from Microsoft 365 inbox',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'm365_read_emails',
        arguments: {
          top: 10,
          unread_only: false
        }
      }
    },
    {
      name: 'send_email',
      description: 'Send an email via Microsoft 365',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'm365_send_email',
        arguments: {
          to: 'REQUIRED: Array of recipient emails',
          subject: 'REQUIRED: Email subject',
          body: 'REQUIRED: Email body'
        }
      }
    },
    {
      name: 'list_calendar_events',
      description: 'List upcoming calendar events from Microsoft 365',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'm365_list_calendar_events',
        arguments: {
          top: 10
        }
      }
    },
    {
      name: 'search_dropbox',
      description: 'Search files in Dropbox by name or content',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'dropbox_search_files',
        arguments: {
          query: 'REQUIRED: Search query'
        }
      }
    },
    {
      name: 'list_vercel_deployments',
      description: 'List recent Vercel deployments for abbi-ai project',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'vercel_list_deployments',
        arguments: {
          project_id: 'cv-abbi-ai-com-20260107',
          limit: 5
        }
      }
    },
    {
      name: 'check_cloudflare_zones',
      description: 'List Cloudflare DNS zones',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'cf_list_zones',
        arguments: {}
      }
    },
    {
      name: 'run_mac_command',
      description: 'Execute a shell command on Mac Studio',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'mac_run_command',
        arguments: {
          command: 'REQUIRED: Shell command to execute'
        }
      }
    },
    {
      name: 'generate_image',
      description: 'Generate a photorealistic image with Imagen 3 (Google Vertex AI)',
      url: 'https://abbi-ai.com/api/tools/mcp-call',
      body: {
        tool_name: 'vertex_vertex_imagen_generate',
        arguments: {
          prompt: 'REQUIRED: Image description',
          number_of_images: 1
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
