// Ultra-fast LLM endpoint for ABBI voice with pre-loaded Hive Mind context
// NO TOOLS = NO LATENCY - context injected into system prompt

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MCP_ENDPOINT = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

// Fetch recent Hive Mind entries (cached for 60 seconds)
let hiveMindCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds

async function getHiveMindContext() {
  const now = Date.now();

  // Return cached data if still fresh
  if (hiveMindCache && (now - cacheTimestamp < CACHE_TTL)) {
    return hiveMindCache;
  }

  try {
    const sql = 'SELECT CATEGORY, SUMMARY, PRIORITY, CREATED_AT FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES ORDER BY CREATED_AT DESC LIMIT 5';

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

    if (data.result && data.result.success && data.result.data) {
      const entries = data.result.data.map(e =>
        `- ${e.CATEGORY}: ${e.SUMMARY.substring(0, 150)}`
      ).join('\n');

      hiveMindCache = `\n\n## Recent Hive Mind Entries:\n${entries}`;
      cacheTimestamp = now;
      return hiveMindCache;
    }
  } catch (error) {
    console.error('Hive Mind fetch error:', error);
  }

  return ''; // Return empty if fetch fails
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

// Call Claude WITHOUT tools for speed
async function callClaude(messages, systemPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      temperature: 0.3,
      system: systemPrompt,
      messages: messages
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

    // Fetch Hive Mind context (cached)
    const hiveMindContext = await getHiveMindContext();

    // Build system prompt with context
    const systemPrompt = `You are Abbi (Adaptive Second Brain Intelligence). Address user as "Your Grace". Be concise, direct, and conversational.

You have access to recent Hive Mind memory:${hiveMindContext}

Keep responses under 3 sentences. Be helpful and proactive.`;

    const anthropicMessages = convertMessages(messages);
    const claudeResponse = await callClaude(anthropicMessages, systemPrompt);

    // Extract text response
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
