// Add skip_turn system tool to ABBI agent
// This endpoint adds the skip_turn tool with custom description

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

export default async function handler(req, res) {
  // CORS headers
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
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'agent_id is required' });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
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
        error: 'Failed to get agent config',
        details: error
      });
    }

    const currentAgent = await getResponse.json();

    // Prepare skip_turn tool
    const skipTurnTool = {
      type: "system",
      name: "skip_turn",
      description: "Use this tool when Your Grace says phrases indicating they need time to think or process: 'wait', 'hold on', 'I need a moment', 'just a moment', 'give me a second', 'one moment', 'let me think', or 'hold that thought'. When these phrases are detected, invoke skip_turn immediately to pause the conversation and wait for the user to re-engage."
    };

    // Get existing tools or initialize empty array
    const existingTools = currentAgent.conversation_config?.agent?.tools || [];

    // Check if skip_turn already exists
    const hasSkipTurn = existingTools.some(tool =>
      tool.type === 'system' && tool.name === 'skip_turn'
    );

    if (hasSkipTurn) {
      return res.json({
        success: true,
        message: 'skip_turn tool already configured',
        agent_id: agent_id
      });
    }

    // Add skip_turn to tools
    const updatedTools = [...existingTools, skipTurnTool];

    // Update agent with new tool
    const updatePayload = {
      ...currentAgent,
      conversation_config: {
        ...currentAgent.conversation_config,
        agent: {
          ...currentAgent.conversation_config?.agent,
          tools: updatedTools
        }
      }
    };

    const updateResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      return res.status(updateResponse.status).json({
        error: 'Failed to update agent',
        details: error
      });
    }

    const updatedAgent = await updateResponse.json();

    return res.json({
      success: true,
      message: 'skip_turn tool added successfully',
      agent_id: agent_id,
      tools: updatedAgent.conversation_config?.agent?.tools || []
    });

  } catch (error) {
    console.error('Error adding skip_turn tool:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
