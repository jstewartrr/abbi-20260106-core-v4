// Custom LLM endpoint for ABBI with direct MCP tool integration
// This endpoint receives requests from ElevenLabs and routes to Claude with direct tool calls

// Use environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT || 'SOVEREIGN_MIND';
const SNOWFLAKE_USER = process.env.SNOWFLAKE_USER || '';
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD || '';

// MCP tools available through SM Gateway - Essential tools only for speed
const MCP_TOOLS = [
  {
    name: 'openai_sm_hive_mind_read',
    description: 'Read Hive Mind entries',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' }
      }
    }
  },
  {
    name: 'openai_sm_hive_mind_write',
    description: 'Write to Hive Mind',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        summary: { type: 'string' }
      },
      required: ['category', 'summary']
    }
  },
  {
    name: 'm365_read_emails',
    description: 'Read emails',
    input_schema: {
      type: 'object',
      properties: {
        top: { type: 'integer' }
      }
    }
  },
  {
    name: 'm365_list_calendar_events',
    description: 'List calendar events',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'asana_search_tasks',
    description: 'Search tasks',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      }
    }
  }
];

// Convert ElevenLabs message format to Anthropic format
function convertToAnthropicMessages(elevenlabsMessages) {
  if (!elevenlabsMessages || !Array.isArray(elevenlabsMessages)) {
    return [];
  }

  return elevenlabsMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content || msg.text || ''
  }));
}

// Call MCP tool through SM Gateway using JSON-RPC format
async function callMCPTool(toolName, params) {
  try {
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params || {}
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract result from JSON-RPC response
    if (data.result && data.result.content) {
      const textContent = data.result.content.find(c => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return { text: textContent.text };
        }
      }
    }

    return data.result || data;
  } catch (error) {
    console.error(`MCP tool error (${toolName}):`, error);
    return { error: error.message };
  }
}

// Call Claude API with tool use capability
async function callClaudeWithTools(messages, model = 'claude-3-5-haiku-20241022') {
  const apiUrl = 'https://api.anthropic.com/v1/messages';

  // API key from environment variable

  const requestBody = {
    model: model,
    max_tokens: 512,
    temperature: 0.3,
    system: `You are Abbi. Address user as "Your Grace". Be concise and direct. You have access to: Hive Mind, M365, Asana, Drive.`,
    messages: messages,
    tools: MCP_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }))
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}

// Main handler for ElevenLabs custom LLM requests
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    // Convert to Anthropic format
    const anthropicMessages = convertToAnthropicMessages(messages);

    // Call Claude with MCP tools
    const claudeResponse = await callClaudeWithTools(anthropicMessages, model);

    // Handle tool use
    if (claudeResponse.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const content of claudeResponse.content) {
        if (content.type === 'tool_use') {
          const result = await callMCPTool(content.name, content.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: content.id,
            content: JSON.stringify(result)
          });
        }
      }

      // Continue conversation with tool results
      const followUpMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: claudeResponse.content },
        { role: 'user', content: toolResults }
      ];

      const finalResponse = await callClaudeWithTools(followUpMessages, model);

      // Extract text response
      const textContent = finalResponse.content.find(c => c.type === 'text');

      return res.json({
        response: textContent?.text || 'I apologize, I encountered an issue processing that.',
        model: model || 'claude-sonnet-4-20250514'
      });
    }

    // Extract text response from Claude
    const textContent = claudeResponse.content.find(c => c.type === 'text');

    return res.json({
      response: textContent?.text || 'I apologize, I encountered an issue processing that.',
      model: model || 'claude-sonnet-4-20250514'
    });

  } catch (error) {
    console.error('ABBI LLM error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
