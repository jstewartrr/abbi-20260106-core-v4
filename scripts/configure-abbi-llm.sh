#!/bin/bash
# Configure ABBI ElevenLabs agent to use custom LLM endpoint with MCP Gateway access

AGENT_ID="agent_0001kcva7evzfbt9q5zc9n2q4vaz"
CUSTOM_LLM_URL="https://abbi-ai.com/api/abbi/llm"

# Get ElevenLabs API key from environment or prompt
if [ -z "$ELEVENLABS_API_KEY" ]; then
    echo "Enter your ElevenLabs API key:"
    read -s ELEVENLABS_API_KEY
fi

echo "Configuring ABBI agent to use custom LLM endpoint..."
echo "Agent ID: $AGENT_ID"
echo "Custom LLM URL: $CUSTOM_LLM_URL"

# Update agent with custom_llm configuration
curl -X PATCH "https://api.elevenlabs.io/v1/convai/agents/$AGENT_ID" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_config": {
      "agent": {
        "prompt": {
          "custom_llm": {
            "url": "'"$CUSTOM_LLM_URL"'",
            "model": "claude-sonnet-4-20250514",
            "headers": {},
            "request_format": "openai",
            "response_format": "openai"
          }
        }
      }
    }
  }'

echo ""
echo "Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Deploy the website to Vercel (git push or vercel deploy)"
echo "2. Set the ANTHROPIC_API_KEY environment variable in Vercel"
echo "3. Test ABBI by clicking the avatar on abbi-ai.com"
echo ""
echo "ABBI will now have access to:"
echo "  ✓ Hive Mind (Snowflake persistent memory)"
echo "  ✓ Microsoft 365 (email, calendar)"
echo "  ✓ Asana (tasks, projects)"
echo "  ✓ Google Drive (files)"
echo "  ✓ All SM Gateway MCP tools"
