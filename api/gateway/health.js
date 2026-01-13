const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const healthCheck = await fetch(GATEWAY_URL.replace('/mcp', '/health'));
    const isHealthy = healthCheck.ok;

    return res.json({
      success: true,
      status: isHealthy ? 'healthy' : 'degraded',
      response_time: 0,
      endpoints: [
        { name: 'Gateway V3', status: isHealthy ? 'online' : 'offline' }
      ]
    });
  } catch (error) {
    return res.json({
      success: true,
      status: 'offline',
      response_time: 0,
      endpoints: [{ name: 'Gateway V3', status: 'offline' }]
    });
  }
}
