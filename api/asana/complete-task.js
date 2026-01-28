// Mark Asana task as complete
const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 30,
};

async function mcpCall(tool, args = {}, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: tool, arguments: args },
          id: Date.now() + attempt
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const content = data.result?.content?.[0];
      if (content?.type === 'text') {
        if (content.text.startsWith('Error:')) throw new Error(content.text);
        return JSON.parse(content.text);
      }
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ success: false, error: 'task_id is required' });
    }

    console.log(`Marking task ${task_id} as complete...`);

    // Update task to completed via Asana MCP
    const result = await mcpCall('asana_update_task', {
      task_id: task_id,
      completed: true
    });

    console.log('✓ Task marked as complete');

    return res.status(200).json({
      success: true,
      message: 'Task marked as complete',
      task: result.task || result
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
