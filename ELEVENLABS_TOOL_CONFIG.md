# ElevenLabs ABBI Agent Configuration

## Steps to Clone and Configure New ABBI Agent

### 1. Clone Current ABBI Agent

1. Go to https://elevenlabs.io/app/conversational-ai
2. Find agent: `ABBI` (ID: `agent_0001kcva7evzfbt9q5zc9n2q4vaz`)
3. Click "Clone" or "Duplicate"
4. Name it: `ABBI-TEST-GPT4o`
5. Copy the new agent ID (will be something like `agent_xxxxxxxxxxxxx`)

### 2. Configure Agent Settings

**Model:**
- Switch from Claude to **OpenAI GPT-4o**
- Temperature: 0.7
- Max tokens: 400

**Voice:**
- Keep current voice or choose preferred ElevenLabs voice

**System Prompt:**
```
You are Abbi (Adaptive Second Brain Intelligence), the voice interface for Your Grace's command center.

You have access to the Hive Mind - a knowledge base tracking all projects, decisions, and tasks. Use the tools to:
- Read recent Hive Mind entries when user asks about current projects
- Search Hive Mind when user asks about specific topics
- Write to Hive Mind when user shares important information or decisions

Address the user as "Your Grace". Be concise, direct, and conversational. Keep responses under 3 sentences unless more detail is specifically requested.

When accessing Hive Mind, summarize the most relevant information naturally in conversation.
```

### 3. Add Custom Tools

#### Tool 1: Read Hive Mind

**Name:** `read_hive_mind`

**Description:**
```
Reads the most recent entries from Hive Mind knowledge base. Use this when user asks about current projects, recent activity, or what's been happening.
```

**URL:** `https://abbi-ai.com/api/tools/read-hive-mind`

**Method:** POST

**Parameters:**
```json
{
  "limit": {
    "type": "number",
    "description": "Number of entries to retrieve (1-20)",
    "default": 5
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "count": 5,
  "entries": [
    {
      "id": 1234,
      "category": "CHECKPOINT",
      "summary": "Completed website rebuild",
      "priority": "HIGH",
      "workstream": "ABBI v3.0",
      "created_at": "2026-01-12T10:30:00Z"
    }
  ]
}
```

---

#### Tool 2: Search Hive Mind

**Name:** `search_hive_mind`

**Description:**
```
Searches Hive Mind for specific topics, keywords, or categories. Use this when user asks about a specific project, topic, or wants to find something specific.
```

**URL:** `https://abbi-ai.com/api/tools/search-hive-mind`

**Method:** POST

**Parameters:**
```json
{
  "query": {
    "type": "string",
    "description": "Search keywords (searches summary, workstream, category)",
    "required": false
  },
  "category": {
    "type": "string",
    "description": "Filter by category: CHECKPOINT, ARTIFACT, ANALYSIS, DECISION, TODO, NOTE, ERROR",
    "required": false
  },
  "limit": {
    "type": "number",
    "description": "Maximum results to return (1-20)",
    "default": 10
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "count": 3,
  "query": "website",
  "entries": [...]
}
```

---

#### Tool 3: Write to Hive Mind

**Name:** `write_hive_mind`

**Description:**
```
Creates a new entry in Hive Mind. Use this when user shares important information, makes a decision, or wants to remember something. Categories: CHECKPOINT (progress updates), DECISION (choices made), TODO (tasks), NOTE (general info), ARTIFACT (completed work).
```

**URL:** `https://abbi-ai.com/api/tools/write-hive-mind`

**Method:** POST

**Parameters:**
```json
{
  "category": {
    "type": "string",
    "description": "Entry category: CHECKPOINT, ARTIFACT, ANALYSIS, DECISION, TODO, NOTE, ERROR",
    "required": true
  },
  "summary": {
    "type": "string",
    "description": "Brief description of the information (1-2 sentences)",
    "required": true
  },
  "priority": {
    "type": "string",
    "description": "Priority level: LOW, NORMAL, HIGH, URGENT",
    "default": "NORMAL"
  },
  "workstream": {
    "type": "string",
    "description": "Related project or workstream name",
    "required": false
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Entry added to Hive Mind successfully",
  "entry": {
    "category": "DECISION",
    "summary": "Switching ABBI to GPT-4o for better conversation",
    "priority": "HIGH"
  }
}
```

---

### 4. Test Configuration

**Conversation Settings:**
- Turn timeout: 2.5 seconds
- Turn eagerness: Normal
- First message: "Good day, Your Grace. ABBI online and ready."

### 5. Get Agent ID

After saving, copy the new agent ID from the agent settings page. You'll need this for the test page.

---

## Tool Endpoint URLs (Production)

All tools are deployed at:
- https://abbi-ai.com/api/tools/read-hive-mind
- https://abbi-ai.com/api/tools/search-hive-mind
- https://abbi-ai.com/api/tools/write-hive-mind

These endpoints are live and ready to use.
