# Email API Files

**Last Updated:** 2026-01-26
**Dashboard Version:** v9.9.4

---

## ✅ ACTIVE - USED BY DASHBOARD

These files are actively called by the dashboard and MUST remain in this directory (file path = API endpoint URL).

### Called Directly by Dashboard (jstewart.html)

1. **`triaged-emails.js`** ⭐ CRITICAL
   - Endpoint: `/api/email/triaged-emails`
   - Purpose: Fetch triaged emails from HIVE_MIND for dashboard display
   - Called: On page load
   - Modified: 2026-01-26

2. **`mark-read.js`** ⭐ CRITICAL
   - Endpoint: `/api/email/mark-read`
   - Purpose: Mark emails as read in M365/Outlook
   - Called: When user clicks "Mark as Read & Close"

3. **`mark-processed.js`** ⭐ CRITICAL
   - Endpoint: `/api/email/mark-processed`
   - Purpose: Mark emails as processed in HIVE_MIND (prevents reappearing)
   - Called: After marking email as read

4. **`chat-qa.js`** ⭐ CRITICAL
   - Endpoint: `/api/email/chat-qa`
   - Purpose: ABBI chat interface with all 12 tools (email, calendar, Asana)
   - Uses: Claude Sonnet 4, M365 gateway
   - Modified: 2026-01-26 (fixed tool name prefix)

### Background Triage (ONE of these should run via Make.com)

5. **`auto-triage-v2.js`** ⭐ RECOMMENDED
   - Endpoint: `/api/email/auto-triage-v2`
   - Purpose: Read unread emails directly from M365 and triage them
   - Approach: Direct M365 access (simpler, no RAW.EMAILS needed)
   - Folders synced: See lines 103-115
   - Modified: 2026-01-26
   - **Make.com:** Should call this every 5-10 minutes

6. **`auto-triage.js`** ⭐ ALTERNATIVE
   - Endpoint: `/api/email/auto-triage`
   - Purpose: Read emails from RAW.EMAILS table and triage them
   - Approach: Requires separate Make.com scenario to populate RAW.EMAILS
   - Modified: 2026-01-26 (added folder exclusion list)
   - **Make.com:** Should call this every 5-10 minutes (only if using RAW.EMAILS approach)

7. **`triage.js`** ⭐ CRITICAL (internal)
   - Endpoint: `/api/email/triage`
   - Purpose: Individual email triage with Claude AI
   - Called by: auto-triage.js and auto-triage-v2.js
   - Writes to: HIVE_MIND table
   - Modified: 2026-01-26

---

## ⚠️ LEGACY / UTILITY - NOT DIRECTLY USED

These files exist but are NOT actively called by the current dashboard. They may be utilities, migrations, or old approaches.

### Old Approaches (replaced by current system)
- `triage-webhook.js` - Old webhook approach (replaced by auto-triage)
- `background-briefing-refresh.js` - Old caching system (not used)
- `daily-briefing.js` - Old briefing approach (replaced by triaged-emails.js)
- `process-triage.js` - Old triage approach
- `mark-read-delete-spam.js` - Old approach

### Database Migrations / Setup
- `add-analysis-columns.js` - One-time migration
- `add-processed-column.js` - One-time migration
- `init-briefing-table.js` - One-time setup

### Utility Scripts (run manually as needed)
- `clear-email-cache.js` - Clear cache utility
- `clear-junk-emails.js` - Cleanup utility
- `mark-all-unread.js` - Utility script
- `unflag-all.js` - Utility script
- `quick-cache-populate.js` - Utility
- `trigger-mac-triage.js` - Mac-specific trigger

### Testing Files
- `test-cache.js` - Testing
- `test-snowflake.js` - Testing
- `chat-qa-test.js` - Testing
- `chat-qa-working-backup.js` - Backup file

### Internal/Supporting Files
- `get-email.js` - Utility (may be used internally)
- `process-email.js` - May be called by dashboard (verify)
- `process-single-email.js` - Utility
- `flag-email.js` - Utility (may be called by mark-read)

---

## 🚨 IMPORTANT: DO NOT MOVE OR RENAME FILES

**Why?** Vercel uses the file path to determine the API endpoint URL:
- File: `/api/email/triaged-emails.js`
- Serves: `https://abbi-ai.com/api/email/triaged-emails`

If you move or rename a file, the endpoint URL changes and the dashboard breaks!

To organize files:
- ✅ Use this README to identify active vs legacy
- ✅ Archive legacy files by moving to `/api/email/_archive/` folder
- ❌ Do NOT move or rename active files

---

## 📋 MAKE.COM SETUP

You need ONE Make.com scenario running every 5-10 minutes:

### Option A: Direct M365 (Recommended)
```
Scenario Name: [ACTIVE - DASHBOARD] Auto-Triage V2
URL: https://abbi-ai.com/api/email/auto-triage-v2
Method: POST
Frequency: Every 5-10 minutes
```

### Option B: RAW.EMAILS Approach
```
Scenario 1: [ACTIVE - DASHBOARD] Sync M365 to RAW.EMAILS
- Fetch unread emails from M365
- Insert into SOVEREIGN_MIND.RAW.EMAILS table
- Frequency: Every 5-10 minutes

Scenario 2: [ACTIVE - DASHBOARD] Run Auto-Triage
URL: https://abbi-ai.com/api/email/auto-triage
Method: POST
Frequency: Every 5-10 minutes
```

---

## 🔍 QUICK REFERENCE

**Dashboard loads emails from:**
→ `SOVEREIGN_MIND.HIVE_MIND.ENTRIES` WHERE `CATEGORY = 'triaged_email'`

**Emails get into HIVE_MIND via:**
→ `triage.js` (called by auto-triage-v2.js or auto-triage.js)

**When user clicks "Mark as Read":**
1. `mark-read.js` → M365 marks as read
2. `mark-processed.js` → HIVE_MIND marks processed
3. Dashboard removes email locally
4. Next email auto-expands

**Folder lists:**
- **Synced folders:** See `auto-triage-v2.js` lines 103-115
- **Excluded folders:** See `auto-triage.js` lines 122-127
