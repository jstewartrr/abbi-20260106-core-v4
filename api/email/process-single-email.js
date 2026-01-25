// Process a single email - for testing
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function mcpCall(gateway, tool, args, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now()
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      try {
        return JSON.parse(content.text);
      } catch (e) {
        return { text: content.text };
      }
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  const { email_id } = req.query;

  if (!email_id) {
    return res.status(400).json({ success: false, error: 'Missing email_id parameter' });
  }

  try {
    console.log(`Processing single email: ${email_id}`);

    // Step 1: Fetch full email body from M365
    console.log('Fetching email from M365...');
    const emailData = await mcpCall(M365_GATEWAY, 'get_email', {
      message_id: email_id,
      user: 'jstewart@middleground.com'
    });

    const subject = emailData.subject || 'No subject';
    const from = emailData.from?.emailAddress?.name || emailData.from?.emailAddress?.address || 'Unknown';
    const body = emailData.body || '';

    console.log(`Subject: ${subject}`);
    console.log(`Body length: ${body.length}`);

    if (!body || body.length === 0) {
      throw new Error('Email body is empty');
    }

    // Step 2: Generate AI summary
    console.log('Generating AI summary...');
    const bodyForAI = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);

    const prompt = `You are an executive assistant for John Stewart, Managing Partner at Middleground Capital (private equity firm).

Analyze this email and provide a structured response in JSON format:

Email:
From: ${from}
Subject: ${subject}
Body: ${bodyForAI}

Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence comprehensive summary of key points and context",
  "action_plan": ["Action item 1", "Action item 2"] or [] if no actions needed,
  "recommended_response": "Suggested email reply text" or "" if no reply needed
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
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      throw new Error(`AI API returned ${aiRes.status}: ${errorText}`);
    }

    const aiData = await aiRes.json();
    let aiText = aiData.content[0].text.trim();
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    const analysis = JSON.parse(aiText);
    console.log('AI summary generated');

    // Step 3: Save to Snowflake
    console.log('Saving to Snowflake...');
    const fullBody = body.replace(/'/g, "''").substring(0, 65000);
    const aiSummary = (analysis.summary || '').replace(/'/g, "''");
    const actionPlan = JSON.stringify(analysis.action_plan || []).replace(/'/g, "''");
    const recommendedResponse = (analysis.recommended_response || '').replace(/'/g, "''");

    const updateSQL = `
      UPDATE SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS
      SET
        FULL_BODY = '${fullBody}',
        AI_SUMMARY = '${aiSummary}',
        ACTION_PLAN = '${actionPlan}',
        RECOMMENDED_RESPONSE = '${recommendedResponse}',
        PROCESSED_AT = CURRENT_TIMESTAMP()
      WHERE EMAIL_ID = '${email_id.replace(/'/g, "''")}'
    `;

    await mcpCall(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', { sql: updateSQL });
    console.log('Saved to database');

    return res.json({
      success: true,
      email_id,
      subject,
      from,
      summary: analysis.summary,
      action_plan: analysis.action_plan,
      recommended_response: analysis.recommended_response
    });

  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
