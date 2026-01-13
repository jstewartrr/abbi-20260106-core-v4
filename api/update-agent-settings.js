// Update ElevenLabs agent settings
// This endpoint updates conversation settings for an agent

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({
        error: 'ElevenLabs API key not configured'
      });
    }

    const { agent_id, settings } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id required' });
    }

    // Get current agent config
    const getResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agent_id}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!getResponse.ok) {
      const error = await getResponse.text();
      return res.status(getResponse.status).json({
        error: 'Failed to get agent',
        details: error
      });
    }

    const currentAgent = await getResponse.json();

    // Merge settings
    const updatedAgent = {
      ...currentAgent,
      conversation_config: {
        ...currentAgent.conversation_config,
        ...settings.conversation_config
      }
    };

    // Update agent
    const updateResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedAgent)
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      return res.status(updateResponse.status).json({
        error: 'Failed to update agent',
        details: error
      });
    }

    const result = await updateResponse.json();

    return res.json({
      success: true,
      message: 'Agent settings updated',
      agent: result
    });

  } catch (error) {
    console.error('Error updating agent:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
