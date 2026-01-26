# Active Dashboard APIs & Make.com Scenarios

**Last Updated:** 2026-01-26
**Dashboard Version:** v9.9.4

## ACTIVELY USED BY DASHBOARD

### APIs Called by Dashboard (jstewart.html)

1. **`/api/email/triaged-emails`** - CRITICAL
   - Called on page load to fetch triaged emails
   - Reads from: `SOVEREIGN_MIND.HIVE_MIND.ENTRIES` where `CATEGORY = 'triaged_email'`
   - Returns: Emails with analysis, categories, priorities
   - Modified: 2026-01-26 (added error handling)

2. **`/api/email/mark-read`** - CRITICAL
   - Called when user clicks "Mark as Read & Close"
   - Marks emails as read in M365/Outlook
   - Uses: M365 gateway

3. **`/api/email/mark-processed`** - CRITICAL
   - Called after marking email as read
   - Sets `processed: true` in HIVE_MIND so email doesn't reappear
   - Updates: `SOVEREIGN_MIND.HIVE_MIND.ENTRIES`

4. **`/api/email/chat-qa`** - CRITICAL
   - ABBI chat interface for replying to emails
   - Uses: Claude Sonnet 4, M365 gateway (all 12 tools)
   - Modified: 2026-01-26 (fixed tool name prefix stripping)

### Background Processes (Should Run via Make.com)

**OPTION A: Use auto-triage.js (Reads from RAW.EMAILS)**

5. **`/api/email/auto-triage`** - ACTIVE (if using RAW.EMAILS approach)
   - Reads untriaged emails from `SOVEREIGN_MIND.RAW.EMAILS`
   - Calls `/api/email/triage` for each email
   - Writes to HIVE_MIND
   - Modified: 2026-01-26 (added folder exclusion list)
   - **Requires:** Make.com scenario to populate RAW.EMAILS table

**OPTION B: Use auto-triage-v2.js (Reads directly from M365)**

6. **`/api/email/auto-triage-v2`** - ACTIVE (if using direct M365 approach)
   - Reads unread emails directly from M365 folders
   - Folder whitelist (lines 103-115):
     - Inbox
     - 01.01 John through 01.28 Human Capital
     - 02.05 Dechert
   - Calls `/api/email/triage` for each email
   - Writes to HIVE_MIND
   - **Does NOT require RAW.EMAILS** - goes straight to M365

7. **`/api/email/triage`** - CRITICAL (called by both auto-triage options)
   - Individual email triage with Claude AI
   - Determines: spam, classification (To/CC), priority, tag, summary
   - Writes to: `SOVEREIGN_MIND.HIVE_MIND.ENTRIES`
   - If spam: deletes from M365 and marks as read

---

## REQUIRED MAKE.COM SCENARIOS

### If Using auto-triage.js (RAW.EMAILS approach):

**Scenario 1: Populate RAW.EMAILS**
- Name: "Sync M365 Emails to Snowflake RAW.EMAILS"
- Frequency: Every 5-10 minutes
- Action: Fetch unread emails from M365, insert into `SOVEREIGN_MIND.RAW.EMAILS`
- Status: **UNKNOWN** (need to check if this exists)

**Scenario 2: Run Auto-Triage**
- Name: "Run Auto-Triage from RAW.EMAILS"
- Frequency: Every 5-10 minutes
- Action: Call `https://abbi-ai.com/api/email/auto-triage`
- Status: **UNKNOWN**

### If Using auto-triage-v2.js (Direct M365 approach):

**Scenario (Recommended): Run Auto-Triage V2**
- Name: "Run Auto-Triage V2 (Direct M365)"
- Frequency: Every 5-10 minutes
- Action: Call `https://abbi-ai.com/api/email/auto-triage-v2`
- Status: **UNKNOWN**
- **Advantage:** Simpler - no RAW.EMAILS table needed

---

## NOT USED BY DASHBOARD (Can Disable)

These files exist but are NOT called by the current dashboard:

- `add-analysis-columns.js` - Database migration script
- `add-processed-column.js` - Database migration script
- `background-briefing-refresh.js` - Old caching system (not used)
- `chat-qa-test.js` - Testing file
- `chat-qa-working-backup.js` - Backup file
- `clear-email-cache.js` - Not used
- `clear-junk-emails.js` - Utility script
- `daily-briefing.js` - Old approach (replaced by triaged-emails.js)
- `get-email.js` - Utility (may be used internally)
- `init-briefing-table.js` - Database migration script
- `mark-all-unread.js` - Utility script
- `mark-read-delete-spam.js` - Old approach
- `process-email.js` - May be called by dashboard (need to verify)
- `process-single-email.js` - Utility
- `process-triage.js` - Old approach
- `quick-cache-populate.js` - Utility
- `test-cache.js` - Testing file
- `test-snowflake.js` - Testing file
- `triage-webhook.js` - Old webhook approach (replaced by auto-triage)
- `trigger-mac-triage.js` - Mac-specific trigger
- `unflag-all.js` - Utility script

---

## CHANGES MADE IN THIS SESSION (2026-01-26)

### Modified Files:

1. **`/api/email/triaged-emails.js`**
   - No changes (already working)

2. **`/api/email/auto-triage.js`** - Lines 122-138
   - **Added:** Folder exclusion list to prevent "Daily Liquidity" and other FYI folders from being triaged
   - Excludes: Daily Liquidity, Sent Items, Deleted Items, Drafts, Junk Email, 01.31 Office Team

3. **`/api/email/chat-qa.js`** - Line 13
   - **Fixed:** Tool name prefix stripping (`m365_reply_email` → `reply_email`)
   - **Fixed:** Syntax error with unescaped backticks in template literal

4. **`/package.json`** - NEW FILE
   - **Added:** `"type": "module"` for native ESM support

5. **`/dashboards/executive/jstewart.html`**
   - **Enhanced:** Auto-expand first email in category (no list view)
   - **Enhanced:** Auto-advance to next email on Mark as Read
   - **Enhanced:** Auto-update sidebar category counts

### New Files Created:
- None (only documentation)

---

## RECOMMENDED ACTION PLAN

### Step 1: Check Make.com Scenarios
Look for scenarios with these patterns:
- "auto-triage" or "triage"
- "RAW.EMAILS" or "Snowflake sync"
- "M365" or "Outlook sync"

### Step 2: Identify Which Approach You're Using
- **If you have a scenario populating RAW.EMAILS:** Keep using `auto-triage.js`
- **If you DON'T have RAW.EMAILS sync:** Switch to `auto-triage-v2.js` (simpler)

### Step 3: Label Active Scenarios in Make.com
Rename scenarios to include **[ACTIVE - DASHBOARD]** prefix:
- `[ACTIVE - DASHBOARD] Run Auto-Triage V2`
- `[ACTIVE - DASHBOARD] Sync M365 to RAW.EMAILS`

### Step 4: Disable/Archive Unused Scenarios
Any scenario NOT feeding the dashboard should be labeled:
- `[ARCHIVED]` or `[NOT USED]`

---

## QUICK REFERENCE

**What feeds the dashboard?**
→ HIVE_MIND table (`SOVEREIGN_MIND.HIVE_MIND.ENTRIES` where `CATEGORY = 'triaged_email'`)

**How do emails get into HIVE_MIND?**
→ Either `auto-triage.js` (via RAW.EMAILS) OR `auto-triage-v2.js` (direct M365)

**Which folders are synced?**
→ See `auto-triage-v2.js` lines 103-115 for full list

**Which folders are EXCLUDED?**
→ See `auto-triage.js` lines 122-127 for exclusion list

**What happens when I click "Mark as Read"?**
1. Email marked as read in M365 (`mark-read.js`)
2. Email marked as `processed: true` in HIVE_MIND (`mark-processed.js`)
3. Email removed from dashboard display (client-side)
4. Category counts updated (client-side)
5. Next email auto-expands (client-side)
