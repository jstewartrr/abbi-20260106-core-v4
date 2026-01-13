const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

// Model endpoints - using LibreChat configuration
const MODEL_ENDPOINTS = {
  'claude-sonnet-4': { endpoint: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-3.5-sonnet': { endpoint: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  'claude-3.5-haiku': { endpoint: 'anthropic', model: 'claude-3-5-haiku-20241022' },
  'gpt-4o': { endpoint: 'openai', model: 'gpt-4o' },
  'gpt-4o-mini': { endpoint: 'openai', model: 'gpt-4o-mini' },
  'o1': { endpoint: 'openai', model: 'o1' },
  'o1-mini': { endpoint: 'openai', model: 'o1-mini' },
  'grok-3': { endpoint: 'xai', model: 'grok-3' },
  'grok-2': { endpoint: 'xai', model: 'grok-2' },
  'gemini-2.0-flash': { endpoint: 'google', model: 'gemini-2.0-flash-exp' },
  'gemini-1.5-pro': { endpoint: 'google', model: 'gemini-1.5-pro' }
};

async function callAI(model, messages, stream = false) {
  const config = MODEL_ENDPOINTS[model] || MODEL_ENDPOINTS['claude-sonnet-4'];

  // For now, return mock response - will integrate with actual AI APIs
  return {
    role: 'assistant',
    content: `[AI Response from ${config.model}] This is a placeholder. Real AI integration requires API keys and proper routing to ${config.endpoint} endpoint.`,
    model: config.model
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model = 'claude-sonnet-4', stream = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const response = await callAI(model, messages, stream);

    return res.json({
      success: true,
      message: response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
