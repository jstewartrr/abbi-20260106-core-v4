# Dashboard Version Changelog

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
