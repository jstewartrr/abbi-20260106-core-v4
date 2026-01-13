# ABBI MCP Gateway & Hive Mind Integration

## Overview
This document explains how ABBI is configured to access the full Sovereign Mind infrastructure including:
- **Hive Mind**: Persistent memory via Snowflake
- **SM Gateway MCP**: All connected tools (M365, Asana, Drive, etc.)
- **Claude API**: Full reasoning capability with tool use

## Architecture

```
User → ABBI (ElevenLabs Voice)
         ↓
    Custom LLM Endpoint (/api/abbi/llm.js)
         ↓
    Claude API (with tool calling)
         ↓
    SM Gateway MCP
         ↓
    [M365, Asana, Drive, Snowflake/Hive Mind]
```

## Setup Instructions

### 1. Deploy the Custom LLM Endpoint

The endpoint is already created at `/api/abbi/llm.js`. Deploy to Vercel:

```bash
cd /Users/john/abbi-ai-site
git add .
git commit -m "Add ABBI custom LLM endpoint with MCP Gateway access"
git push
```

Or use Vercel CLI:
```bash
vercel deploy --prod
```

### 2. Set Environment Variables in Vercel

Go to Vercel Dashboard → abbi-ai-site → Settings → Environment Variables

Add:
```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

### 3. Configure ElevenLabs Agent

Run the configuration script:

```bash
cd /Users/john/abbi-ai-site
export ELEVENLABS_API_KEY="your-elevenlabs-api-key"
./scripts/configure-abbi-llm.sh
```

Or manually via curl:
```bash
curl -X PATCH "https://api.elevenlabs.io/v1/convai/agents/agent_0001kcva7evzfbt9q5zc9n2q4vaz" \
  -H "xi-api-key: YOUR_ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_config": {
      "agent": {
        "prompt": {
          "custom_llm": {
            "url": "https://abbi-ai.com/api/abbi/llm",
            "model": "claude-sonnet-4-20250514",
            "headers": {},
            "request_format": "openai",
            "response_format": "openai"
          }
        }
      }
    }
  }'
```

## Available MCP Tools

ABBI now has access to these tools through the custom LLM endpoint:

### Snowflake / Hive Mind
- `sm_query_snowflake` - Query any Snowflake database
- `sm_hive_mind_read` - Read recent Hive Mind entries
- `sm_hive_mind_write` - Write to Hive Mind for persistence

### Microsoft 365
- `m365_read_emails` - Read inbox emails
- `m365_send_email` - Send emails
- `m365_list_calendar_events` - List calendar events
- `m365_create_event` - Create calendar events

### Asana
- `asana_list_tasks` - List tasks with filters
- `asana_get_task` - Get task details
- `asana_create_task` - Create new task
- `asana_update_task` - Update existing task
- `asana_search_tasks` - Search across tasks

### Google Drive
- `drive_list_folder_contents` - List files in folder
- `drive_search_files` - Search for files
- `drive_read_text_file` - Read text file contents
- `drive_read_excel_file` - Read Excel/Sheets data

## Testing

1. Go to https://abbi-ai.com
2. Log in with token: `SM-c22da6c5433fc0c4a1a11e5d8b6e1082`
3. Click the ABBI avatar
4. Allow microphone access
5. Say: "Check my Hive Mind for recent entries"
6. ABBI should query Snowflake and report back

## Troubleshooting

### ABBI isn't using tools
- Check that the custom_llm is configured (run configure script)
- Verify ANTHROPIC_API_KEY is set in Vercel
- Check Vercel function logs for errors

### Tools returning errors
- Verify SM Gateway is online: https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/health
- Check MCP tool credentials in SM Gateway config

### Voice connection fails
- Verify ElevenLabs agent is active
- Check that agent_id matches in voice.html and index.html
- Review browser console for errors

## Configuration Files

- `/api/abbi/llm.js` - Custom LLM endpoint with MCP integration
- `/scripts/configure-abbi-llm.sh` - Agent configuration script
- `index.html` - Main website (ABBI page, line 472)
- `voice.html` - Standalone voice interface

## SM Gateway Endpoint

Current: `https://cv-sm-gateway-v3.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp`

## Notes

- ABBI uses Claude Haiku 4.5 via ElevenLabs built-in until custom_llm is configured
- Once configured, ABBI uses Claude Sonnet 4 via custom endpoint
- All conversations are automatically logged to Hive Mind
- Session IDs use format: ABBI-XXXX1234567
