# Skip Turn Configuration for ABBI

## Overview
Enable ABBI to automatically skip her turn and stay silent when you need a moment to think or process.

## Configuration Steps

### Via ElevenLabs Dashboard (Recommended):

1. **Navigate to Agent Settings**
   - Go to https://elevenlabs.io/app/conversational-ai
   - Select agent: `agent_2501ketq01k7e4vrnbrvvefa99ej` (abbi-openai)

2. **Add Skip Turn Tool**
   - Click on the **Tools** section
   - Click **"Add tool"** button
   - Select **"Skip Turn"** from the system tools list
   - Click **"Enable"** or **"Add"**

3. **Configure Tool Description**
   Add this description to help the LLM know when to use it:
   ```
   Use this tool when Your Grace says phrases indicating they need time to think or process:
   - "wait"
   - "hold on"
   - "I need a moment"
   - "just a moment"
   - "give me a second"
   - "one moment"
   - "let me think"
   - "hold that thought"

   When these phrases are detected, invoke skip_turn immediately to pause the conversation and wait for the user to re-engage.
   ```

4. **Save Configuration**
   - Click **Save** to apply the changes
   - The agent will now have the skip_turn tool available

## How It Works

When you say any of the trigger phrases:
1. ABBI will respond with "Yes, Your Grace" (per system prompt)
2. She will invoke the `skip_turn` tool
3. She will remain completely silent without re-prompting
4. She will wait for you to speak again before continuing

## Testing

Test the feature at: https://abbi-ai.com/test-abbi.html

Try saying:
- "Hold on, I need a moment" - ABBI should acknowledge and go silent
- "Just a moment" - ABBI should stop and wait
- "Wait, let me think" - ABBI should pause without checking in

## Alternative: API Configuration

If you prefer to configure via API, use this payload:

```json
{
  "conversation_config": {
    "agent": {
      "tools": [
        {
          "type": "system",
          "name": "skip_turn",
          "description": "Use this tool when Your Grace says phrases indicating they need time to think: 'wait', 'hold on', 'I need a moment', 'just a moment', 'give me a second', 'one moment', 'let me think', or 'hold that thought'. Invoke skip_turn immediately to pause and wait for user re-engagement."
        }
      ]
    }
  }
}
```

Then PATCH to: `https://api.elevenlabs.io/v1/convai/agents/agent_2501ketq01k7e4vrnbrvvefa99ej`

## Notes

- The skip_turn tool is a system tool provided by ElevenLabs
- It requires no parameters (optional `reason` parameter can be provided)
- Works alongside the existing system prompt which tells ABBI to say "Yes, Your Grace" before skipping
- The tool ensures natural conversation flow by respecting pauses without unnecessary agent responses
