# Make.com Correct Setup for Dashboard

**Last Updated:** 2026-01-26
**Dashboard Version:** v9.9.4

---

## ✅ WHAT SHOULD BE RUNNING (ONLY ONE SCENARIO NEEDED)

### Required: Auto-Triage V2 Scenario

**Scenario Name:** `[ACTIVE - DASHBOARD] Auto-Triage V2`

**Configuration:**
- **Trigger:** Schedule (Cron)
- **Frequency:** Every 5 minutes
- **Action:** HTTP Request
  - **Method:** POST
  - **URL:** `https://abbi-ai.com/api/email/auto-triage-v2`
  - **Headers:** None required
  - **Body:** Empty (or `{}`)
  - **Timeout:** 300 seconds (5 minutes max)

**What It Does:**
1. Reads unread emails directly from M365 folders (no intermediate tables)
2. Triages each email with Claude AI
3. Writes to `SOVEREIGN_MIND.HIVE_MIND.ENTRIES` table
4. Dashboard reads from HIVE_MIND to display emails

**Folders Synced (11 folders):**
- Inbox
- 01.01 John
- 01.02 Scot
- 01.03 Tom
- 01.04 Kathryn
- 01.05 Will
- 01.13 MC
- 01.24 N Transaction Team
- 01.26 N Operations Team
- 01.28 Human Capital
- 02.05 Dechert

**Folders EXCLUDED (automatically skipped by code):**
- Daily Liquidity
- Sent Items
- Deleted Items
- Drafts
- Junk Email
- 01.31 Office Team

---

## ❌ DELETE THESE SCENARIOS (Legacy/Obsolete)

### 1. Any scenario calling `/api/email/triage-webhook`
**Why:** This endpoint is archived. It was the old approach that used EMAIL_BRIEFING_RESULTS table.
**Examples:**
- "Email Triage Webhook"
- "Daily Email Processing"
- Any scenario with "webhook" in the name

### 2. Any scenario syncing individual folders
**Why:** The new system handles ALL folders in one scenario.
**Examples:**
- "Email (Outlook), Snowflake : 02.1 Investor" ❌
- "Email (Outlook), Snowflake : 000.1 Signature Request" ❌
- Any scenario that syncs ONE specific folder

### 3. Any scenario writing to RAW.EMAILS table
**Why:** Only needed if using `auto-triage.js` instead of `auto-triage-v2.js`
**Unless:** You specifically chose the RAW.EMAILS approach (Option B)

### 4. Any scenario writing to RAW.EMAIL_BRIEFING_RESULTS
**Why:** This table is completely deprecated. Dashboard doesn't read from it.

### 5. Any scenario calling `/api/email/daily-briefing`
**Why:** This endpoint is archived. Replaced by `/api/email/triaged-emails`

---

## 🔍 HOW TO AUDIT YOUR MAKE.COM SCENARIOS

### Step 1: List All Email-Related Scenarios
Look for scenarios containing:
- "email"
- "triage"
- "outlook"
- "snowflake"
- "M365"

### Step 2: Check Each Scenario's Endpoint
For each scenario, look at the HTTP module and find the URL it calls.

### Step 3: Decision Matrix

| Endpoint URL | Keep or Delete? |
|--------------|-----------------|
| `/api/email/auto-triage-v2` | ✅ KEEP (should have exactly ONE) |
| `/api/email/auto-triage` | ⚠️ KEEP only if using RAW.EMAILS approach |
| `/api/email/triage-webhook` | ❌ DELETE (archived) |
| `/api/email/daily-briefing` | ❌ DELETE (archived) |
| Any other email endpoint | ❌ DELETE (likely legacy) |

### Step 4: Check for Per-Folder Scenarios
If you have scenarios that:
- Read from ONE specific Outlook folder
- Write to Snowflake

**Action:** ❌ DELETE ALL OF THEM
**Why:** `auto-triage-v2` handles ALL folders in one scenario

---

## 📋 CORRECT FINAL STATE

After cleanup, you should have in Make.com:

**Active Scenarios: 1**
- `[ACTIVE - DASHBOARD] Auto-Triage V2`
  - Runs every 5 minutes
  - Calls `/api/email/auto-triage-v2`
  - Handles all 11 folders

**Archived/Disabled: Everything else**
- All per-folder scenarios (02.1 Investor, 000.1 Signature Request, etc.)
- All webhook scenarios
- All daily-briefing scenarios
- All EMAIL_BRIEFING_RESULTS scenarios

---

## 🚀 HOW TO CREATE THE CORRECT SCENARIO (If Missing)

If you don't have the Auto-Triage V2 scenario, create it:

### Step-by-Step:

1. **Create New Scenario**
   - Click "Create a new scenario"
   - Name: `[ACTIVE - DASHBOARD] Auto-Triage V2`

2. **Add Schedule Trigger**
   - Module: "Schedule" (clock icon)
   - Interval: Every 5 minutes
   - Start time: Now
   - Click OK

3. **Add HTTP Request**
   - Module: "HTTP" → "Make a request"
   - URL: `https://abbi-ai.com/api/email/auto-triage-v2`
   - Method: POST
   - Headers: (leave empty)
   - Body type: Raw
   - Content type: JSON (application/json)
   - Request content: `{}`
   - Timeout: 300
   - Parse response: No
   - Click OK

4. **Save and Enable**
   - Click "Save" (bottom right)
   - Toggle "On" (top right)
   - Click "Run once" to test

5. **Verify It Works**
   - Check execution history
   - Should complete in 5-60 seconds
   - No errors
   - Go to dashboard - should see triaged emails

---

## ⚠️ COMMON ISSUES

### Issue: "FUNCTION_INVOCATION_FAILED"
**Cause:** Vercel function timeout (max 60 seconds on Pro plan)
**Fix:** This shouldn't happen with auto-triage-v2 unless processing 50+ emails at once

### Issue: "Tool not found: sm_query_snowflake"
**Cause:** Wrong gateway URL or gateway is down
**Fix:** Verify gateway is accessible

### Issue: "No emails appearing in dashboard"
**Symptom:** Make.com scenario runs successfully but dashboard shows 0 emails
**Cause:** Check if emails were marked as spam and deleted
**Debug:**
```sql
SELECT COUNT(*)
FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
WHERE CATEGORY = 'triaged_email'
  AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)
```

### Issue: Scenario runs but takes 3+ minutes
**Cause:** Processing too many emails in one batch
**Fix:** Reduce batch size in auto-triage-v2.js (line 154: change from 10 to 5)

---

## 🎯 QUICK VERIFICATION

After cleaning up Make.com:

1. **Dashboard loads emails?** ✅ System working
2. **New emails appear within 10 minutes?** ✅ Auto-triage running correctly
3. **Only ONE Make.com scenario for email?** ✅ Correct setup
4. **Scenario runs every 5 minutes without errors?** ✅ All good

If any of the above is NO, check the troubleshooting section.

---

## 📞 NEED TO ADD MORE FOLDERS?

If you want to sync additional folders (like "02.1 Investor" or "Signature Request"):

**File to edit:** `/api/email/auto-triage-v2.js`
**Line:** 103-115
**Action:** Add folder name to the `foldersToCheck` array

Example:
```javascript
const foldersToCheck = [
  'Inbox',
  '01.01 John',
  // ... existing folders ...
  '02.05 Dechert',
  '02.1 Investor',           // ADD THIS
  '000.1 Signature Request'  // ADD THIS
];
```

Then commit, push, and deploy:
```bash
git add api/email/auto-triage-v2.js
git commit -m "Add Investor and Signature Request folders to triage"
git push
vercel --prod --yes
```

No changes needed in Make.com - it will automatically pick up the new folders!
