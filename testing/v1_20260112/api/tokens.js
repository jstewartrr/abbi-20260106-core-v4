export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Return mock token usage data
  return res.json({
    success: true,
    total_tokens: 2847293,
    total_cost: 42.18,
    avg_per_session: 15847,
    active_sessions: 12
  });
}
