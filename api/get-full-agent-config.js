// Get complete agent configuration including MCP integrations
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
  }

  const agentId = req.query.agent_id || 'agent_2501ketq01k7e4vrnbrvvefa99ej';

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get agent: ${response.status}`);
    }

    const agent = await response.json();

    return res.json({
      success: true,
      agent: agent
    });

  } catch (error) {
    console.error('Error getting agent config:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
