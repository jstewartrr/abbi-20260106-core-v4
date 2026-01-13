export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Return default presets based on LibreChat Model Specs
  return res.json({
    success: true,
    presets: [
      {
        id: 'abbi-default',
        name: 'ABBI Assistant',
        model: 'claude-sonnet-4',
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 1,
        system_prompt: 'You are ABBI, an adaptive AI assistant.'
      },
      {
        id: 'quick-chat',
        name: 'Quick Chat',
        model: 'claude-3.5-haiku',
        temperature: 0.8,
        max_tokens: 2048,
        top_p: 1
      },
      {
        id: 'code-devops',
        name: 'Code & DevOps',
        model: 'claude-sonnet-4',
        temperature: 0.5,
        max_tokens: 8192,
        top_p: 0.9
      }
    ]
  });
}
