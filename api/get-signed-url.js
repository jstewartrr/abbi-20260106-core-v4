// Get signed URL for ElevenLabs ABBI voice session
// This endpoint fetches the signed URL from ElevenLabs for the ABBI agent

const DEFAULT_AGENT_ID = 'agent_0001kcva7evzfbt9q5zc9n2q4vaz'; // Production ABBI
const TEST_AGENT_ID = 'agent_2501ketq01k7e4vrnbrvvefa99ej'; // Test ABBI (GPT-4o)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({
        error: 'ElevenLabs API key not configured'
      });
    }

    // Allow agent_id to be specified via query parameter (for testing)
    const agentId = req.query.agent_id || DEFAULT_AGENT_ID;

    // Validate agent ID format
    if (!agentId.startsWith('agent_')) {
      return res.status(400).json({
        error: 'Invalid agent ID format'
      });
    }

    // Call ElevenLabs API to get signed URL
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      return res.status(response.status).json({
        error: 'Failed to get signed URL from ElevenLabs',
        details: error
      });
    }

    const data = await response.json();

    return res.json({
      signed_url: data.signed_url
    });

  } catch (error) {
    console.error('Error getting signed URL:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
