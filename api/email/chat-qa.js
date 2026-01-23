// ABBI Chat Q&A - Clean rebuild v8.92
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { question, email_context, context } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Missing question parameter'
      });
    }

    console.log(`💬 Chat Q&A - Question: ${question?.substring(0, 100)}`);
    console.log(`📧 Email context: ${email_context ? 'Yes' : 'No'}`);

    // Build context for AI
    let fullPrompt = question;

    if (email_context) {
      const emailData = `
EMAIL CONTEXT:
From: ${email_context.from || 'Unknown'}
To: ${email_context.to || 'Unknown'}
Subject: ${email_context.subject || 'No subject'}
Received: ${email_context.received || 'Unknown'}
Preview: ${email_context.preview || ''}

Full Email Body:
${email_context.body || email_context.preview || 'No content available'}

---

User Question: ${question}`;

      fullPrompt = emailData;
    }

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
          content: fullPrompt
        }],
        system: 'You are ABBI, John Stewart\'s AI assistant for email management at Middleground Capital. Analyze emails and provide clear, actionable guidance. Format responses with:\n1) Recommended response - Whether to reply and suggested tone/content\n2) Key action items - Specific tasks to complete\n3) Deadlines & time-sensitive matters - Any urgent items\n\nBe concise and professional.'
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
