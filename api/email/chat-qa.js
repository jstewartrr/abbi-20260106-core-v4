// ABBI Chat Q&A - Clean rebuild v8.92
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Missing question parameter'
      });
    }

    console.log(`💬 Chat Q&A - Question: ${question?.substring(0, 100)}`);

    // Call Claude API directly
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: question
        }],
        system: 'You are ABBI, a helpful AI assistant for email management. Answer questions concisely and professionally.'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const answer = data.content[0].text;

    return res.json({
      success: true,
      answer: answer
    });

  } catch (error) {
    console.error('❌ Chat Q&A error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat question'
    });
  }
}
