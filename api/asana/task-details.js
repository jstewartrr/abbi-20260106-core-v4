// Fetch full task details including subtasks and comments
const GATEWAY_URL = 'https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

export const config = {
  maxDuration: 60,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { task_id } = req.query;

    if (!task_id) {
      return res.status(400).json({ success: false, error: 'task_id is required' });
    }

    console.log(`Fetching details for task ${task_id}...`);
    const startTime = Date.now();

    // Fetch full task details
    const taskDetails = await mcpCall('asana_get_task', { task_id });

    // Handle different response formats
    const task = taskDetails.task || taskDetails;

    if (!task || !task.gid) {
      console.error('Invalid task response:', taskDetails);
      return res.status(404).json({ success: false, error: 'Task not found or invalid response' });
    }

    // Fetch subtasks
    let subtasks = [];
    if (task.num_subtasks > 0) {
      try {
        const subtasksData = await mcpCall('asana_get_subtasks', { task_id });
        subtasks = (subtasksData.subtasks || []).map(st => ({
          gid: st.gid,
          name: st.name,
          completed: st.completed || false
        }));
      } catch (error) {
        console.error('Error fetching subtasks:', error);
      }
    }

    // Fetch comments/stories
    let comments = [];
    try {
      const storiesData = await mcpCall('asana_get_task_stories', { task_id });
      comments = (storiesData.stories || [])
        .filter(story => story.type === 'comment' && story.text)
        .map(story => ({
          text: story.text,
          created_by: {
            name: story.created_by?.name || 'Unknown'
          },
          created_at: story.created_at
        }));
    } catch (error) {
      console.error('Error fetching comments:', error);
    }

    // Fetch attachments
    let attachments = [];
    try {
      const attachmentsData = await mcpCall('asana_get_attachments', { task_id });
      attachments = (attachmentsData.attachments || []).map(att => ({
        gid: att.gid,
        name: att.name,
        download_url: att.download_url
      }));
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }

    const elapsed = Date.now() - startTime;
    console.log(`✓ Fetched task details (${elapsed}ms)`);

    return res.status(200).json({
      success: true,
      task: {
        gid: task.gid,
        name: task.name,
        notes: task.notes || '',
        subtasks: subtasks,
        subtasks_count: subtasks.length,
        subtasks_completed: subtasks.filter(st => st.completed).length,
        comments: comments,
        comments_count: comments.length,
        attachments: attachments,
        attachments_count: attachments.length
      },
      processing_time_ms: elapsed
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
