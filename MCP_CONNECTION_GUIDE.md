# MCP Load-Balancer Connection Guide

## Primary Load-Balancer Connection

**Server Name:** `sovereign-mind-loadbalancer`
**Type:** HTTP
**URL:** `https://mcp.abbi-ai.com/mcp`
**Tools Available:** 133 tools across 12 integrations
**Status:** ✅ Tool listing works, ⚠️ execution requires direct endpoints

---

## Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sovereign-mind-loadbalancer": {
      "url": "https://mcp.abbi-ai.com/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

**Location:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

---

## Alternative: Direct Working Endpoints

Since the load-balancer has routing issues, use these direct connections for guaranteed functionality:

### Snowflake MCP (Working)
```json
{
  "mcpServers": {
    "sovereign-mind-snowflake": {
      "url": "https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

**Tools:**
- `query_snowflake` - SQL queries on Sovereign Mind database

### Azure CLI MCP
```json
{
  "mcpServers": {
    "sovereign-mind-azure": {
      "url": "https://cv-sm-azure-cli-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

---

## Combined Configuration (Recommended)

Add all three for maximum capability:

```json
{
  "mcpServers": {
    "sovereign-mind-loadbalancer": {
      "url": "https://mcp.abbi-ai.com/mcp",
      "transport": {
        "type": "http"
      }
    },
    "sovereign-mind-snowflake": {
      "url": "https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp",
      "transport": {
        "type": "http"
      }
    },
    "sovereign-mind-azure": {
      "url": "https://cv-sm-azure-cli-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

---

## For ABBI (ElevenLabs Dashboard)

ABBI cannot use the load-balancer directly. Instead, she needs individual tool endpoints:

### Tool Format for ElevenLabs
Each tool must be added separately with this structure:

**Tool 1: Query Snowflake**
- **Name:** `query_snowflake`
- **URL:** `https://abbi-ai.com/api/tools/mcp-call`
- **Method:** POST
- **Body:**
  ```json
  {
    "tool_name": "query_snowflake",
    "arguments": {
      "sql": "{{sql_query}}"
    }
  }
  ```

**Tool 2: Read Hive Mind**
- **Name:** `read_hive_mind`
- **URL:** `https://abbi-ai.com/api/tools/read-hive-mind`
- **Method:** POST
- **Body:**
  ```json
  {
    "limit": 5
  }
  ```

*(See INFRASTRUCTURE_STATUS.md for all 4 tools)*

---

## Testing the Connection

### Test with curl:
```bash
# List all tools
curl -X POST https://mcp.abbi-ai.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a tool (Note: May not work due to routing issues)
curl -X POST https://mcp.abbi-ai.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"query_snowflake",
      "arguments":{"sql":"SELECT 1"}
    }
  }'
```

### Test direct Snowflake endpoint:
```bash
curl -X POST https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"query_snowflake",
      "arguments":{"sql":"SELECT CURRENT_TIMESTAMP()"}
    }
  }'
```

---

## Available Tool Categories

When connected to the load-balancer, you'll see:

- **Asana** (22 tools) - Project management
- **Microsoft 365** (26 tools) - Email, calendar, contacts
- **Dropbox** (14 tools) - File storage
- **Vercel** (15 tools) - Deployments
- **Tailscale** (12 tools) - VPN management
- **Figma** (10 tools) - Design files
- **DealCloud** (13 tools) - CRM
- **ElevenLabs** (7 tools) - Voice/AI agents
- **Simli** (6 tools) - Video avatars
- **Gemini** (4 tools) - AI chat/generation
- **GitHub** (3 tools) - Code repos
- **Snowflake** (1 tool) - Database queries

---

## Troubleshooting

**Issue:** Tools list but don't execute
- **Cause:** Load-balancer doesn't route calls to individual MCP servers
- **Solution:** Use direct endpoints or ABBI's wrapper API

**Issue:** Connection refused
- **Cause:** MCP server may be down
- **Solution:** Check https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/

**Issue:** Claude Desktop doesn't see tools
- **Cause:** Config file syntax error
- **Solution:** Validate JSON syntax, restart Claude Desktop

---

## Next Steps

1. **For Claude Desktop:** Add load-balancer to config, restart Claude
2. **For ABBI:** Manually add 4 core tools in ElevenLabs dashboard
3. **For custom integrations:** Use direct endpoint URLs for guaranteed execution

**Support:** See INFRASTRUCTURE_STATUS.md for full system details
