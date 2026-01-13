// Custom LLM endpoint for ABBI with direct Hive Mind integration
// Connects directly to Snowflake MCP endpoint for fast memory access

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MCP_ENDPOINT = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

// Simplified tools - just Hive Mind for now to keep it fast
const MCP_TOOLS = [
  {
    name: 'read_hive_mind',
    description: 'Read recent entries from Hive Mind memory system',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Number of recent entries to retrieve (default: 5)'
        }
      }
    }
  },
  {
    name: 'write_hive_mind',
    description: 'Write a new entry to Hive Mind for persistence',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category for this entry (e.g., "Task", "Note", "Decision")'
        },
        summary: {
          type: 'string',
          description: 'The content to store in Hive Mind'
        }
      },
      required: ['category', 'summary']
    }
  }
];

// Execute tool via Snowflake MCP endpoint
async function executeTool(toolName, params) {
  console.log(`Executing tool: ${toolName}`, params);

  try {
    if (toolName === 'read_hive_mind') {
      const limit = params.limit || 5;
      const sql = `SELECT ID, CATEGORY, SOURCE, SUMMARY, PRIORITY, WORKSTREAM, CREATED_AT FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES ORDER BY CREATED_AT DESC LIMIT ${limit}`;

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'sm_query_snowflake',
            arguments: { sql }
          }
        })
      });

      const data = await response.json();

      if (data.result && data.result.success) {
        return {
          success: true,
          entries: data.result.data.map(entry => ({
            id: entry.ID,
            category: entry.CATEGORY,
            source: entry.SOURCE,
            summary: entry.SUMMARY,
            priority: entry.PRIORITY,
            workstream: entry.WORKSTREAM,
            created_at: entry.CREATED_AT
          })),
          count: data.result.row_count
        };
      }

      return { error: 'Failed to read Hive Mind', details: data };
    }

    if (toolName === 'write_hive_mind') {
      const { category, summary } = params;
      const sql = `INSERT INTO SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CATEGORY, SOURCE, SUMMARY) VALUES ('${category}', 'abbi_voice_interface', '${summary.replace(/'/g, "''")}')`;

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'sm_query_snowflake',
            arguments: { sql }
          }
        })
      });

      const data = await response.json();

      if (data.result && data.result.success) {
        return {
          success: true,
          message: 'Entry added to Hive Mind',
          category,
          summary
        };
      }

      return { error: 'Failed to write to Hive Mind', details: data };
    }

    return { error: 'Unknown tool' };

  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { error: error.message };
  }
}

// Convert message format
function convertMessages(elevenlabsMessages) {
  if (!elevenlabsMessages || !Array.isArray(elevenlabsMessages)) {
    return [];
  }
  return elevenlabsMessages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content || msg.text || ''
  }));
}

// Call Claude with tools
async function callClaude(messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      temperature: 0.3,
      system: 'You are Abbi. Address user as "Your Grace". Be concise. You have access to Hive Mind memory.',
      messages: messages,
      tools: MCP_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  return await response.json();
}

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
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const anthropicMessages = convertMessages(messages);
    const claudeResponse = await callClaude(anthropicMessages);

    // Handle tool use
    if (claudeResponse.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const content of claudeResponse.content) {
        if (content.type === 'tool_use') {
          const result = await executeTool(content.name, content.input);
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

      const finalResponse = await callClaude(followUpMessages);
      const textContent = finalResponse.content.find(c => c.type === 'text');

      return res.json({
        response: textContent?.text || 'I apologize, I encountered an issue.',
        model: 'claude-3-5-haiku-20241022'
      });
    }

    // No tool use - return text response
    const textContent = claudeResponse.content.find(c => c.type === 'text');
    return res.json({
      response: textContent?.text || 'I apologize, I encountered an issue.',
      model: 'claude-3-5-haiku-20241022'
    });

  } catch (error) {
    console.error('ABBI LLM error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
