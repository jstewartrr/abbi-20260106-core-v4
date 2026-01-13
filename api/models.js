export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Return static model status
  return res.json({
    success: true,
    models: [
      { provider: 'Anthropic', model: 'Claude Sonnet 4', status: 'online' },
      { provider: 'Anthropic', model: 'Claude 3.5 Sonnet', status: 'online' },
      { provider: 'Anthropic', model: 'Claude 3.5 Haiku', status: 'online' },
      { provider: 'OpenAI', model: 'GPT-4o', status: 'online' },
      { provider: 'OpenAI', model: 'o1', status: 'online' },
      { provider: 'OpenAI', model: 'o3-mini', status: 'online' },
      { provider: 'xAI', model: 'Grok 3', status: 'online' },
      { provider: 'Google', model: 'Gemini 2.0 Flash', status: 'online' },
      { provider: 'AWS Bedrock', model: 'Nova Pro', status: 'online' }
    ]
  });
}
