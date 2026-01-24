// Trigger email triage on Mac Studio via MCP (no timeout limits)
const MAC_MCP_GATEWAY = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function mcpCall(tool, args = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout for trigger

  try {
    const res = await fetch(MAC_MCP_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: Date.now()
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') return JSON.parse(content.text);
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Verify this is a cron job or authenticated request
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';

    if (req.headers['x-vercel-cron'] !== '1' && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - this endpoint is for cron jobs only'
      });
    }

    console.log('🚀 Triggering email triage on Mac Studio...');

    // Get Anthropic API key
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Run the Python script on Mac Studio
    const command = `cd /Users/john/abbi-ai-site/scripts && ANTHROPIC_API_KEY='${anthropicKey}' python3 email-triage-background.py`;

    console.log('📡 Calling Mac Studio MCP to run triage script...');

    const result = await mcpCall('mac_run_command', {
      command: command
    });

    console.log('✅ Mac Studio triage triggered');
    console.log('Output:', result.stdout?.substring(0, 500));

    return res.json({
      success: true,
      message: 'Email triage triggered on Mac Studio',
      output: result.stdout?.substring(0, 1000),
      exit_code: result.exit_code
    });

  } catch (error) {
    console.error('❌ Trigger error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
