# Dashboard Version Changelog

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
