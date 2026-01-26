// ABBI Chat Q&A - Simplified version without tool calling
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { question, email_context, context, conversation_history } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Missing question parameter'
      });
    }

    // Build context for AI
    let fullPrompt = question;

    if (email_context) {
      const emailData = `
EMAIL CONTEXT:
From: ${email_context.from || 'Unknown'}
To: ${email_context.to || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Body: ${email_context.body || email_context.preview || 'No content available'}

---

User Question: ${question}`;
      fullPrompt = emailData;
    }

    // Build messages array
    let messages = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      messages = conversation_history;
    }
    messages.push({
      role: 'user',
      content: fullPrompt
    });

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: messages,
        system: 'You are ABBI, an AI assistant helping John Stewart (Managing Partner at Middleground Capital) manage his emails and calendar. Provide concise, actionable advice. When analyzing emails, provide: 1) Recommended response/action, 2) Key points, 3) Any time-sensitive matters.'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const answer = data.content.find(block => block.type === 'text')?.text || data.content[0].text;

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
