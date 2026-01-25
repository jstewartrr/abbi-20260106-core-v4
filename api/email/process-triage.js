const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function mcpCall(url, tool, args = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args }, id: Date.now() })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const content = data.result?.content?.[0];
  return content?.type === 'text' ? JSON.parse(content.text) : content;
}

export default async function handler(req, res) {
  try {
    const { message_id, user, from, subject } = req.body;

    if (!message_id) {
      return res.status(400).json({ success: false, error: 'Missing message_id' });
    }

    console.log(`Processing email: ${message_id}`);

    // Fetch full email body from M365
    const emailData = await mcpCall(GATEWAY_URL, 'm365_get_email', {
      message_id,
      user: user || 'jstewart@middleground.com'
    });

    const emailSubject = emailData.subject || subject || 'No subject';
    const emailFrom = emailData.from?.emailAddress?.name || from || 'Unknown';
    const body = emailData.body || emailData.bodyPreview || '';

    if (!body) {
      throw new Error('Email body is empty');
    }

    // Clean body for AI
    const bodyForAI = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000);

    const prompt = `You are an executive assistant for John Stewart, Managing Partner at Middleground Capital (a private equity firm).

Analyze this email and provide a structured response in JSON format:

Email:
From: ${emailFrom}
Subject: ${emailSubject}
Body: ${bodyForAI}

Return ONLY valid JSON (no markdown, no explanation):
{
  "topic": "One-line topic/category",
  "summary": "2-3 sentence comprehensive summary",
  "requesting": "What is the sender asking for or informing about?",
  "actionItems": "What specific actions are needed?",
  "yourAction": "What should John do? (Reply/Review/Forward/Acknowledge/etc)",
  "recommendedPlan": {
    "decision": "Reply/Forward/No action needed/etc",
    "reasoning": "Why this is the best course of action",
    "emails": []
  }
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      throw new Error(`AI API error: ${aiRes.status} - ${errorText}`);
    }

    const aiData = await aiRes.json();
    let aiText = aiData.content[0].text.trim();
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    const analysis = JSON.parse(aiText);

    return res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Error in process-triage:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
