const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // List tools from MCP Gateway to get connector count
    const mcpRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const data = await mcpRes.json();
    const tools = data.result?.tools || [];

    return res.json({
      success: true,
      total_tools: tools.length,
      connectors: [
        { name: 'M365 Email', tools: tools.filter(t => t.name?.includes('m365_') && t.name?.includes('email')).length },
        { name: 'M365 Calendar', tools: tools.filter(t => t.name?.includes('m365_') && t.name?.includes('calendar')).length },
        { name: 'Asana', tools: tools.filter(t => t.name?.includes('asana_')).length },
        { name: 'GitHub', tools: tools.filter(t => t.name?.includes('github_')).length },
        { name: 'Vercel', tools: tools.filter(t => t.name?.includes('vercel_')).length },
        { name: 'Make', tools: tools.filter(t => t.name?.includes('make_')).length },
        { name: 'Dropbox', tools: tools.filter(t => t.name?.includes('dropbox_')).length },
        { name: 'ElevenLabs', tools: tools.filter(t => t.name?.includes('elevenlabs_')).length },
        { name: 'Simli', tools: tools.filter(t => t.name?.includes('simli_')).length },
        { name: 'Gemini', tools: tools.filter(t => t.name?.includes('gemini_')).length }
      ].filter(c => c.tools > 0)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
