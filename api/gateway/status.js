const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Try to call gateway_status tool
    const result = await mcpCall(GATEWAY_URL, 'gateway_status', {});

    return res.json({
      success: true,
      online: result.healthy || result.online || 0,
      total: result.total || 0,
      gateways: result.gateways || []
    });
  } catch (error) {
    // Fallback: just check if gateway is responding
    try {
      const healthCheck = await fetch(GATEWAY_URL.replace('/mcp', '/health'));
      return res.json({
        success: true,
        online: healthCheck.ok ? 1 : 0,
        total: 1,
        gateways: [{ name: 'Gateway V3', status: healthCheck.ok ? 'ACTIVE' : 'DOWN' }]
      });
    } catch {
      return res.json({ success: true, online: 0, total: 1, gateways: [] });
    }
  }
}
