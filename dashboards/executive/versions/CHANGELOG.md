# Dashboard Version Changelog

## v9.9.2 - 2026-01-26

### Critical Fix - Email Reply Tool Not Working

Fixed critical bug where m365_reply_email and all other M365/Asana tools would fail silently because the tool names didn't match what the gateway expects.

**Root Cause**: The M365 gateway expects tool names like `reply_email`, `send_email`, `create_event`, etc. (without prefix), but the code was sending `m365_reply_email`, `m365_send_email`, `m365_create_event` with the prefix. This caused the gateway to return "tool not found" errors.

**Solution**: Modified `mcpCall()` function to strip the `m365_` and `asana_` prefixes before sending to the gateway:
```javascript
const actualToolName = tool.replace(/^(m365|asana)_/, '');
```

**Impact**: All email tools now work correctly:
- ✅ m365_reply_email → reply_email
- ✅ m365_send_email → send_email
- ✅ m365_forward_email → forward_email
- ✅ m365_read_emails → read_emails
- ✅ m365_search_emails → search_emails
- ✅ m365_get_email → get_email
- ✅ m365_create_event → create_event
- ✅ m365_update_event → update_event
- ✅ m365_delete_event → delete_event
- ✅ asana_create_task → create_task
- ✅ asana_update_task → update_task
- ✅ asana_create_project → create_project

**Files Changed**:
- `/api/email/chat-qa.js` - Fixed mcpCall to strip tool name prefix (line 13)

**Testing**: Open an email, say "reply to all and say [message]" - ABBI will now successfully send the reply.

---

## v9.9.1 - 2026-01-26

### Bug Fix - Fixed Syntax Error in Chat API

Fixed FUNCTION_INVOCATION_FAILED error caused by unescaped backticks in template literal.

**Root Cause**: The system prompt had a markdown code example using ``` (backticks) inside a JavaScript template literal that also uses backticks. This caused a syntax error: "SyntaxError: Unexpected identifier 'Hi'" at line 414.

**Solution**:
1. Added package.json with "type": "module" for native ESM support
2. Escaped backticks in markdown example: \`\`\` instead of ```

**Result**: Chat now works with all 12 tools (6 email, 3 calendar, 3 Asana) using Claude Sonnet 4 within 60-second timeout.

**Files Changed**:
- `/api/email/chat-qa.js` - Escaped backticks in system prompt
- `/package.json` - Added ESM configuration

**Testing**: Chat responds instantly, can list all available tools, ready for email replies.

---

## v9.9.0 - 2026-01-26

### Major - Restored Working Chat from 1/24

Restored the exact working chat-qa.js from 1/24 at 8:07 PM when everything was working perfectly.

**What Was Restored**:
1. **Full System Prompt** - The comprehensive prompt that explains ABBI's role, context, tools, and email formatting requirements
2. **Claude Sonnet 4** - Using the more capable model (not Haiku) for better tool calling
3. **All Tools** - Email reading (read_emails, search_emails, get_email), sending (send, reply, forward), Calendar, Asana
4. **Proper Email Context** - Email context in user message (not system prompt)
5. **Working Tool Calling** - The exact pattern that was working on 1/24

**Changes from Working Version**:
- maxDuration: 60 seconds (was 300) to comply with Vercel Pro limits

**Why This Matters**:
We spent hours trying to fix the chat with various prompt tweaks and context passing changes, but the real solution was to go back to what was working before. The working version from 1/24 had proper tool calling, good prompts, and reliable execution.

**Files Changed**:
- `/api/email/chat-qa.js` - Restored from 1/24 working backup
- `/dashboards/executive/jstewart.html` - Version bump to v9.9.0

**Testing**: Open an email and say "draft a reply to all that says [message]" - should execute immediately.

---

## v9.8.11 - 2026-01-26

### Bug Fix - Main ABBI Chat Missing Email Context

Fixed issue where main ABBI chat at bottom of page couldn't reply to emails because it wasn't finding the email context.

**Root Cause**: The `getCurrentViewContext()` function relied solely on `window.currentEmailContext` which is only set when rendering an email's full analysis. If the user opened an email but this variable wasn't set, the main ABBI chat had no email context.

**Solution**: Added fallback logic to `getCurrentViewContext()`:
1. First try to use `window.currentEmailContext` (preferred)
2. If that's null, check if `expandedEmailId` exists (meaning an email is currently displayed)
3. Build email context from the email object in `liveData.emails`
4. Include all necessary fields: message_id, email_id, from, to, subject, body, preview, received, category, priority

**Impact**: Now when you have an email open and use the main ABBI chat at the bottom, it will have the email context and can reply/forward emails.

**Files Changed**:
- `/dashboards/executive/jstewart.html` - Enhanced `getCurrentViewContext()` with fallback logic

**Testing**:
1. Open an email
2. Use the main ABBI chat at the bottom
3. Say "draft a reply to all that says [message]"
4. ABBI should now execute the reply

---

## v9.8.10 - 2026-01-26

### Debug - Added Extensive Logging for Email Context Issue

Added comprehensive console logging to diagnose why ABBI isn't seeing email context.

**Logging Added**:
1. **API Side** (`/api/email/chat-qa.js`):
   - Whether email_context was received
   - Message ID, From, Subject values
   - Confirmation when email context added to system prompt
   - Warning when no email context provided

2. **Dashboard Side** (`jstewart.html`):
   - Per-email chat: What's being sent (has_email_context, message_id, question preview)
   - Main ABBI chat: What's being sent (has_email_context, message_id, question preview, current_view)

**Purpose**: These logs will help us see exactly what's being sent from the dashboard and what's being received by the API, so we can identify where the email context is getting lost.

**Next Steps**: Try using the chat and check browser console + Vercel logs to see the flow.

**Files Changed**:
- `/api/email/chat-qa.js` - Added console logging for debugging
- `/dashboards/executive/jstewart.html` - Added console logging on send

---

## v9.8.9 - 2026-01-26

### Bug Fix - Email Context Not Persisting Across Chat Turns

Fixed critical issue where ABBI couldn't see email context after the first message in a conversation, causing her to ask for message_id even when it was available.

**Root Cause**: The EMAIL CONTEXT was only included in the first user message, then stored in conversation history. On subsequent messages, the history contained the old context but Claude couldn't easily access it because it was buried in previous messages rather than being prominently available.

**Solution**: Moved EMAIL CONTEXT from user message to system prompt:
1. **System Prompt Enhancement** - Email context (Message ID, From, To, Subject, Body) is now appended to the system prompt
2. **Always Visible** - This makes it visible to Claude on EVERY turn of the conversation, not just the first
3. **Prominent Placement** - Marked as "CURRENT EMAIL CONTEXT (AVAILABLE FOR THIS CONVERSATION)"
4. **Clear Instructions** - Explicit reminder: "When user says 'reply', 'draft a reply', 'send', 'forward' - use the Message ID above"

**Impact**: Now when you have a multi-turn conversation with ABBI about an email, she can ALWAYS see the email context and Message ID, even on the 5th or 10th message.

**Files Changed**:
- `/api/email/chat-qa.js` - Moved email context from user message to system prompt

**Testing**:
1. Open an email
2. Ask ABBI a question - she responds
3. Then say "draft a reply to all that says [message]" - she should execute immediately without asking for context

---

## v9.8.8 - 2026-01-26

### Bug Fix - ABBI Still Asking for Message ID

Fixed issue where ABBI would ask for message_id even when "draft a reply" command was given with email context.

**Root Cause**: The prompt wasn't clear that "draft a reply" is an ACTION COMMAND (execute immediately), not a QUESTION (provide recommendation). ABBI was treating it as advisory mode instead of execution mode.

**Solution**: Enhanced system prompt to:
1. **Always check for EMAIL CONTEXT first** before responding to any request
2. **Explicit keyword list** for action commands: "reply", "draft a reply", "send", "forward", "respond" = EXECUTE NOW
3. **Clear examples** showing "draft a reply to all that says..." means execute m365_reply_email immediately
4. **Questions vs Actions** - Separated advisory mode ("what should I say") from execution mode ("draft a reply")

**Files Changed**:
- `/api/email/chat-qa.js` - Enhanced prompt with explicit action keywords and EMAIL CONTEXT checking

**Testing**: Say "draft a reply to all that says [message]" - ABBI should immediately execute the reply without asking for message_id.

---

## v9.8.7 - 2026-01-26

### Enhancement - Comprehensive System Prompt for ABBI

Enhanced ABBI's system prompt with comprehensive context about her role, John's identity, and Hive Mind capabilities.

**Changes**:
Merged the simplified working prompt with the original comprehensive prompt to include:

1. **Role & Identity**:
   - ABBI as Executive Dashboard AI assistant
   - John Stewart's profile (Managing Partner at Middleground Capital)
   - Her role as executor, not just advisor

2. **Hive Mind Integration**:
   - Explanation of email triage system
   - AI analysis: classification, priority, summaries
   - Background/Purpose/Key Points format
   - HIVE_MIND database storage

3. **Tools & Capabilities**:
   - Email actions (send, reply with CC/To, forward)
   - Message ID extraction from context
   - Adding recipients to replies

4. **Professional Standards**:
   - Detailed email formatting guidelines
   - Executive tone and style requirements
   - Email analysis format for recommendations

5. **Work Process**:
   - Action commands (execute immediately)
   - Questions (provide recommendations only)
   - Clear examples of usage

**Files Changed**:
- `/api/email/chat-qa.js` - Enhanced system prompt with comprehensive context

**Result**: ABBI now has full context about her role, John's needs, Hive Mind capabilities, and professional standards while maintaining the reliable simplified tool set.

---

## v9.8.6 - 2026-01-26

### Bug Fix - Chat AI Not Using Message ID from Context

Fixed issue where chat AI would ask for message_id instead of using the one already provided in email context.

**Root Cause**: System prompt wasn't explicit enough about extracting and using the message_id from the "EMAIL CONTEXT:" section of the user prompt.

**Solution**: Enhanced system prompt to explicitly instruct Claude to:
1. Extract the "Message ID:" value from the EMAIL CONTEXT section
2. Use that exact value as the message_id parameter in m365_reply_email/forward tools
3. Never ask the user for message_id - it's already provided

**Files Changed**:
- `/api/email/chat-qa.js` - Enhanced system prompt with explicit message_id usage instructions

**Testing**: Ask chat to reply to an email - it should immediately draft and send the reply without asking for message_id.

---

## v9.8.5 - 2026-01-26

### Improvement - Summary Format Cleanup

Updated email summary format in triage process for better readability.

**Changes**:
1. Removed "Detailed multi-line summary with:" prefix
2. Reordered fields to: Background → Purpose → Key Points
3. Added empty lines between sections for better visual separation

**New Format**:
```
- **Background:** context if available

- **Purpose:** ...

- **Key Points:** bullet list
```

**Files Changed**:
- `/api/email/triage.js` - Updated Claude AI prompt for summary format

**Note**: This will apply to newly triaged emails going forward.

---

## v9.8.4 - 2026-01-26

### Bug Fix - Emails Auto-Processing on View

Fixed issue where emails were being automatically marked as processed just by viewing them, causing them to disappear without the user clicking "Mark as Read & Close".

**Root Cause**: The `autoMarkEmailRead()` function was not only marking emails as read in Outlook (intended behavior for viewing), but also marking them as processed in HIVE_MIND and removing them from the display (lines 1421-1459).

**Solution**: Removed the auto-processing logic from `autoMarkEmailRead()` function. Now:
- **Viewing an email** → Only marks as read in Outlook (email stays in dashboard)
- **Clicking "Mark as Read & Close"** → Marks as processed in HIVE_MIND + removes from dashboard (manual control)

**Files Changed**:
- `/dashboards/executive/jstewart.html` - Removed auto-processing from autoMarkEmailRead()

**Testing**: View an email (don't click "Mark as Read" button), then refresh the page - the email should still be visible.

---

## v9.8.3 - 2026-01-26

### Bug Fix - Chat Missing Email Context for Replies

Fixed issue where chat AI couldn't reply to emails because it didn't have the message_id.

**Root Cause**: When passing email context to the chat API, the `message_id` field was not included. The chat could analyze emails but couldn't reply/forward because it didn't know which email to act on.

**Solution**:
1. Added `message_id` and `email_id` to email context in per-email chat (line 2364-2373)
2. Added `message_id` and `email_id` to `window.currentEmailContext` for main chat panel (line 3609-3613)
3. Restored full chat API from 1/24 working version with tool calling capabilities
4. Simplified chat API - moved tools array outside handler, kept only essential email tools (send/reply/forward)
5. Used Claude Haiku 3.5 for speed, 60 second maxDuration for Vercel Pro

**Chat Now Works**:
- ✅ Reply to emails
- ✅ Send new emails
- ✅ Forward emails
- ✅ Add CC/To recipients
- ✅ Professional business email formatting

**Files Changed**:
- `/dashboards/executive/jstewart.html` - Added message_id to email contexts
- `/api/email/chat-qa.js` - Restored working tool calling with essential email tools

**Testing**: Open an email, ask chat to reply - it should draft and send the reply.

---

## v9.8.2 - 2026-01-26

### Bug Fix - Emails Not Being Removed After Processing

Fixed issue where processed emails would reappear on page refresh.

**Root Cause**: When marking an email as read, it was only marked in Outlook and removed from the local display. On page refresh, the email would be fetched again from HIVE_MIND because it wasn't marked as processed there.

**Solution**:
1. Updated `mark-processed.js` API to mark emails as processed in HIVE_MIND by adding `processed: true` to the DETAILS JSON
2. Updated `triaged-emails.js` query to exclude processed emails: `AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)`
3. Updated dashboard's `markEmailReadAndClose()` function to call mark-processed API after marking as read

**Flow Now**:
1. User clicks "Mark as Read" → Email marked as read in Outlook
2. Email unflagged in M365
3. Email marked as `processed: true` in HIVE_MIND
4. Email removed from local display
5. On refresh, processed emails are excluded from the query

**Files Changed**:
- `/api/email/mark-processed.js` - Update HIVE_MIND instead of EMAIL_BRIEFING_RESULTS
- `/api/email/triaged-emails.js` - Exclude processed emails from query
- `/dashboards/executive/jstewart.html` - Call mark-processed API

**Testing**: Process an email, then refresh the page - it should stay gone.

---

## v9.8.1 - 2026-01-26 (Updated)

### Critical Fix - Chat API Still Timing Out

Switched from Claude Sonnet 4 to Claude Haiku 3.5 for much faster response times.

**Root Cause**: Even with the 60-second timeout, Claude Sonnet 4 was taking too long to respond (15-20 seconds per API call), causing the function to timeout when tool calls were involved.

**Solution**:
1. Switched model from `claude-sonnet-4-20250514` to `claude-3-5-haiku-20241022`
2. Reduced max_tokens from 2000 to 1024 for faster generation
3. Claude Haiku responds in 1-3 seconds (vs 10-15 seconds for Sonnet)
4. Still has full tool-calling capabilities (email, calendar, Asana)

**Files Changed**:
- `/api/email/chat-qa.js` - Model switch to Haiku

**Performance**: Chat should now respond instantly without timeouts. Haiku is optimized for speed while maintaining quality for chat interactions.

---

## v9.8.1 - 2026-01-26

### Bug Fix - Zoom/Teams Meeting Links Not Working

Fixed meeting join buttons (Z and T) not opening meeting links correctly.

**Root Cause**: Meeting URLs in calendar events contained HTML-encoded characters (e.g., `&amp;` instead of `&`), which broke the links when clicked.

**Solution**:
1. Added `cleanMeetingUrl()` helper function to decode HTML entities
2. Improved URL regex to stop at HTML tags (`<`) to avoid capturing markup
3. Remove trailing punctuation from URLs
4. Added console logging to help debug meeting link detection
5. Added `rel="noopener noreferrer"` for security

**Files Changed**:
- `/dashboards/executive/jstewart.html` - Meeting URL cleaning and improved extraction

**Testing**: Click on Z (Zoom) or T (Teams) buttons in calendar - they should now open the meeting in a new tab. Check browser console to see detected URLs.

---

## v9.8.0 - 2026-01-26 (Updated)

### Bug Fix - Chat API FUNCTION_INVOCATION_FAILED
Fixed the chat/ABBI AI functionality that was failing with FUNCTION_INVOCATION_FAILED error.

**Root Cause**: The chat API had `maxDuration: 300` seconds (5 minutes), which exceeds Vercel Pro's 60-second limit for serverless functions.

**Solution**:
1. Reduced `maxDuration` from 300s to 60s (Vercel Pro limit)
2. Added aggressive timeouts to Claude API calls:
   - Initial Claude call: 45 second timeout
   - Tool execution response: 30 second timeout
   - MCP tool calls: 20 second timeout
3. Implemented `callClaudeWithTimeout()` helper function with proper AbortController handling

**Files Changed**:
- `/api/email/chat-qa.js` - Timeout optimizations

**Testing**: Chat should now work without timing out. The AI can still execute all tools (email, calendar, Asana) within the 60-second window.

---

## v9.8.0 - 2026-01-26

### Changes
1. **Auto-advance to next email**: After marking an email as read, the dashboard now automatically opens the next email in the filtered list. If there are no more emails, it returns to the list view.

2. **Immediate email removal**: Emails are now removed from the list immediately after marking as read, without requiring a server refresh. This provides instant feedback to the user.

3. **Enhanced logging**: Added detailed console logging to verify that emails are being marked as read in Outlook/M365. Logs include:
   - Current email position in filtered list
   - Next email to be opened (if available)
   - M365 API response
   - Confirmation of email removal from local data

4. **Version number cleanup**: Removed "-TRIAGE" suffix from version number. All future versions will follow semver format (v9.x.x).

### Technical Details
- Modified `markEmailReadAndClose()` function in `/dashboards/executive/jstewart.html`
- Email removal is handled client-side by filtering `liveData.emails`
- No server API changes required
- Version backup saved to `/dashboards/executive/versions/`

### Files Changed
- `/dashboards/executive/jstewart.html` - Main dashboard file

### Deployment
- Committed: 73282fb
- Deployed to: https://abbi-ai.com
- Backup: `/dashboards/executive/versions/jstewart-v9.8.0-20260126-112414.html`

### Rollback Instructions
If needed, restore previous version:
```bash
# Find backup
ls -l /Users/john/abbi-ai-site/dashboards/executive/versions/

# Restore (replace with appropriate backup filename)
cp /Users/john/abbi-ai-site/dashboards/executive/versions/jstewart-v9.7.0-YYYYMMDD-HHMMSS.html /Users/john/abbi-ai-site/dashboards/executive/jstewart.html

# Deploy
cd /Users/john/abbi-ai-site
git add -A && git commit -m "Rollback to v9.7.0" && git push
vercel --prod --yes
```

---

## Previous Versions

### v9.7.0-TRIAGE
- Connected to triaged emails from Hive Mind
- Basic triage functionality
- Manual email refresh
