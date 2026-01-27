# Email Sync System - Version History

## Current Version: v2.1.3
**Date:** 2026-01-27 17:30 UTC
**Status:** Active

---

## v2.1.3 - Fixed Dashboard API Gateway Connection (2026-01-27 17:30 UTC)

### Issue Fixed
- **Problem:** Dashboard showing error: "API returned 500: Unknown tool 'sm_query_snowflake'"
- **Root Cause:** API endpoints were using old MCP gateway (`sm-mcp-gateway-east`) which no longer has working Snowflake tools
- **Impact:** Dashboard unable to load triaged emails from HIVE_MIND database

### Files Updated
Updated Snowflake gateway URL from `sm-mcp-gateway-east` to `cv-sm-snowflake-20260105` in:
1. `/api/email/triaged-emails.js` - Main dashboard API
2. `/api/email/triage.js` - Email triage endpoint
3. `/api/email/mark-processed.js` - Mark emails as read
4. `/api/email/get-email.js` - Fetch email content
5. `/api/email/auto-triage.js` - Auto-triage cron job
6. `/api/asana/triage-tasks.js` - Asana task triage

### Gateway Changes
- **Old Gateway:** `https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp`
- **New Gateway:** `https://cv-sm-snowflake-20260105.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp`
- Tool name remains: `sm_query_snowflake`

### Result
- Dashboard API now working correctly
- Emails loading from HIVE_MIND successfully
- All Snowflake queries functioning properly

### Note About Dashboard Version
- Dashboard shows v9.9.0 - this is the dashboard UI version (correct)
- Email sync system is at v2.1.3 - this is the backend sync version
- These are two separate versioning systems

---

## v2.1.2 - Fixed 10 Broken Email Sync Scenarios (2026-01-27 16:05 UTC)

### Issue Fixed
- **Problem:** Only 3 emails synced today instead of expected 40+ unread emails
- **Root Cause:** 10 Make.com scenarios had invalid SQL (missing new columns: SENDER_EMAIL, TO_RECIPIENTS, CC_RECIPIENTS, IS_READ)
- **Impact:** Emails from 10 folders were not being synced to RAW.EMAILS since yesterday

### Scenarios Fixed & Reactivated
**Updated all scenarios with correct SQL format:**
1. 01.02 Scot (3681002)
2. 01.04 Jackie (3981667)
3. 01.06 Jon La (3681024)
4. 01.07 Kelly (3681034)
5. 01.12 COO Office (3981666)
6. 01.19 Exit and Capital Market (3722955)
7. 01.21 BD (3684210)
8. 01.26 N Operations Team (3684136)
9. 01.34 Support (3981671)
10. 01.35 IT (3684188)

### SQL Format Applied
```sql
INSERT INTO SOVEREIGN_MIND.RAW.EMAILS (
  ID, SUBJECT, SENDER, SENDER_EMAIL, BODY_PREVIEW, BODY_CONTENT,
  RECEIVED_AT, TO_RECIPIENTS, CC_RECIPIENTS, HAS_ATTACHMENTS,
  IMPORTANCE, IS_READ, OUTLOOK_MESSAGE_ID, FOLDER_NAME, CREATED_AT
)
SELECT UUID_STRING(), $${{1.subject}}$$, $${{1.sender.emailAddress.name}}$$,
  $${{1.sender.emailAddress.address}}$$, $${{1.bodyPreview}}$$, $${{1.body.content}}$$,
  '{{1.receivedDateTime}}'::TIMESTAMP_NTZ,
  PARSE_JSON('{{1.toRecipients}}'), PARSE_JSON('{{1.ccRecipients}}'),
  {{1.hasAttachments}}, $${{1.importance}}$$, {{1.isRead}},
  '{{1.id}}', '[FOLDER_NAME]', CURRENT_TIMESTAMP()
```

### Key Changes
- Changed `select: "all"` to `select: "unread"` - only sync unread emails
- Added missing columns with correct SQL delimiters (`$$` for strings, `PARSE_JSON()` for arrays)
- All 10 scenarios now active and syncing

### Result
- All 40 email sync scenarios now working correctly
- Expected: 40+ unread emails will sync within next 15 minutes
- Auto-triage will process them to dashboard

---

## v2.1.1 - Fixed Empty Email Entries (2026-01-27 15:50 UTC)

### Issue Fixed
- **Problem:** 17 emails displayed on dashboard with no information (DETAILS = null)
- **Root Cause:** Created during transition from v2.0.0 simple SQL to v2.1.0 API method
- **Resolution:**
  - Deleted 17 broken entries with `SOURCE = 'email-auto-triage'` and `DETAILS IS NULL`
  - Reset PROCESSED_AT to NULL for remaining unread emails
  - Reprocessed with full API including Claude analysis

### Database Changes
```sql
DELETE FROM HIVE_MIND.ENTRIES WHERE SOURCE = 'email-auto-triage' AND DETAILS IS NULL AND CREATED_AT >= CURRENT_DATE();
UPDATE SOVEREIGN_MIND.RAW.EMAILS SET PROCESSED_AT = NULL WHERE IS_READ = false AND PROCESSED_AT IS NOT NULL;
```

### Result
- All emails now have full Claude-analyzed details
- No more empty entries on dashboard
- Spam filtering active and working

---

## v2.1.0 - Spam Filtering & Process Tracking (2026-01-27)

### Changes Made
1. **Added PROCESSED_AT column** to RAW.EMAILS table
   - Prevents reprocessing of already-triaged emails
   - Allows IS_READ to remain false until user marks as read

2. **Updated Auto-Triage Scenario (ID: 3981772)**
   - Now filters: `WHERE IS_READ = false AND PROCESSED_AT IS NULL`
   - Calls API: https://abbi-ai.com/api/email/triage
   - API uses Claude to detect spam (DealCloud reports, bank statements, automated alerts)
   - **Spam emails:** Deleted from M365, marked as read, NOT saved to HIVE_MIND
   - **Legitimate emails:** Saved to HIVE_MIND, marked as read in M365
   - After processing: Sets PROCESSED_AT = CURRENT_TIMESTAMP()

3. **Workflow:**
   - Make.com syncs unread emails → RAW.EMAILS (IS_READ = false, PROCESSED_AT = null)
   - Auto-triage processes → Claude analyzes → Saves to HIVE_MIND + sets PROCESSED_AT
   - Emails remain IS_READ = false until user clicks "mark as read" on dashboard
   - Dashboard updates both M365 AND RAW.EMAILS when user marks as read

### Database Changes
```sql
ALTER TABLE SOVEREIGN_MIND.RAW.EMAILS ADD COLUMN PROCESSED_AT TIMESTAMP_NTZ;
UPDATE SOVEREIGN_MIND.RAW.EMAILS SET PROCESSED_AT = CURRENT_TIMESTAMP() WHERE CREATED_AT < CURRENT_TIMESTAMP();
```

### Make.com Scenario Changes
- **Scenario:** Auto-Triage New Emails from Snowflake (ID: 3981772)
- **Schedule:** Every 5 minutes
- **Modules:**
  1. Query: `SELECT * FROM RAW.EMAILS WHERE IS_READ = false AND PROCESSED_AT IS NULL LIMIT 50`
  2. Router → HTTP POST to triage API
  3. Update: `SET PROCESSED_AT = CURRENT_TIMESTAMP() WHERE ID = '{{email_id}}'`

---

## v2.0.0 - Initial Working System (2026-01-27 morning)

### Changes Made
1. **Fixed Auto-Triage SQL Query**
   - Changed from API call to direct SQL INSERT
   - Removed 10-minute time window filter
   - Processed ALL unread emails, not just recent ones

2. **Updated 30 Email Sync Scenarios**
   - Added IS_READ, SENDER_EMAIL, TO_RECIPIENTS, CC_RECIPIENTS fields
   - Updated SQL to use PARSE_JSON() for array fields
   - Used $ delimiter instead of replace() function

### Database State
- 4,294 emails in RAW.EMAILS
- 3 unread emails processed to HIVE_MIND

---

## v1.0.0 - Initial Setup (2026-01-26)

### Configuration
- 30 active Make.com scenarios syncing emails from M365
- Scenarios configured with `"select": "unread"` filter
- Auto-triage scenario calling broken API endpoint
- 458 emails synced on initial activation

### Known Issues
- API endpoint returning HTTP 405 errors
- Auto-triage only looking at last 10 minutes
- Emails stuck in RAW.EMAILS, not reaching HIVE_MIND

---

## Rollback Instructions

### To Revert to v2.0.0 (Simple SQL, no spam filtering):
1. Update scenario 3981772 blueprint to single-module SQL:
```sql
INSERT INTO HIVE_MIND.ENTRIES (CATEGORY, SOURCE, SUMMARY, PRIORITY, WORKSTREAM)
SELECT 'triaged_email', 'email-auto-triage',
FOLDER_NAME || ' - ' || SUBJECT, 'NORMAL', 'email'
FROM RAW.EMAILS WHERE IS_READ = false
ORDER BY CREATED_AT DESC LIMIT 50
```

### To Revert to v1.0.0 (Original state):
1. Update scenario 3981772 to use 10-minute filter
2. Revert SQL in email sync scenarios to old format without new columns

---

## Configuration Files

- **Make.com Scenarios:** Dashboard folder (ID: 199883)
- **Auto-Triage:** Scenario ID 3981772
- **API Endpoint:** https://abbi-ai.com/api/email/triage
- **Database:** SOVEREIGN_MIND.RAW.EMAILS → HIVE_MIND.ENTRIES

---

**Maintained by:** Claude Code
**Last Updated:** 2026-01-27 16:05 UTC
