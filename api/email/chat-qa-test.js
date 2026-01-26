// Minimal test version of chat API
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!ANTHROPIC_API_KEY) {
    return res.json({
      success: false,
      error: 'ANTHROPIC_API_KEY not set'
    });
  }

  return res.json({
    success: true,
    answer: 'Test response - API key is set: ' + (ANTHROPIC_API_KEY ? 'YES' : 'NO')
  });
}
