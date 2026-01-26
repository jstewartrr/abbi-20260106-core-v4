# Make.com Deletion Checklist

**Purpose:** Step-by-step guide to clean up Make.com scenarios for the dashboard

---

## 📋 SCENARIO AUDIT WORKSHEET

Go to Make.com and list ALL scenarios related to email/triage/Outlook/Snowflake:

| # | Scenario Name | Endpoint URL | Status | Action |
|---|--------------|--------------|--------|--------|
| 1. |              |              | ❌ Error / ✅ OK |        |
| 2. |              |              | ❌ Error / ✅ OK |        |
| 3. |              |              | ❌ Error / ✅ OK |        |
| 4. |              |              | ❌ Error / ✅ OK |        |
| 5. |              |              | ❌ Error / ✅ OK |        |
| 6. |              |              | ❌ Error / ✅ OK |        |
| 7. |              |              | ❌ Error / ✅ OK |        |
| 8. |              |              | ❌ Error / ✅ OK |        |
| 9. |              |              | ❌ Error / ✅ OK |        |
| 10.|              |              | ❌ Error / ✅ OK |        |

---

## ✅ STEP 1: IDENTIFY THE ONE KEEPER

Look through your list above. Find the scenario that:
- Calls: `/api/email/auto-triage-v2` OR `/api/email/auto-triage`
- Runs every 5-10 minutes
- Has NO folder name in the scenario name

**Found it?**
- [ ] Yes - Scenario name: ___________________________________
- [ ] No - Need to create it (see MAKE_COM_CORRECT_SETUP.md)

**Action:**
- Rename to: `[ACTIVE - DASHBOARD] Auto-Triage V2`
- Ensure it's enabled (ON)
- Check frequency is 5-10 minutes

---

## ❌ STEP 2: DELETE PER-FOLDER SCENARIOS

Check the list for scenarios with folder names:

### Examples to DELETE:
- [ ] "Email (Outlook), Snowflake : 02.1 Investor"
- [ ] "Email (Outlook), Snowflake : 000.1 Signature Request"
- [ ] "Email (Outlook), Snowflake : 01.01 John"
- [ ] "Email (Outlook), Snowflake : Portfolio Companies"
- [ ] Any other scenario with a FOLDER NAME in the title

**Why delete?** The single Auto-Triage V2 scenario handles ALL folders.

**How to delete in Make.com:**
1. Click on the scenario
2. Click the "..." menu (top right)
3. Click "Delete"
4. Confirm deletion

**Alternative (safer):** Disable instead of delete
1. Toggle the scenario OFF
2. Rename to: `[DELETED] [original name]`
3. Keep disabled for 1 week, then delete if no issues

---

## ❌ STEP 3: DELETE WEBHOOK SCENARIOS

Look for scenarios with "webhook" in the name or calling `/triage-webhook`:

- [ ] Any scenario calling `/api/email/triage-webhook`
- [ ] "Email Triage Webhook"
- [ ] "Daily Email Webhook"
- [ ] Any scenario with "webhook" in the name

**Why delete?** This endpoint is archived and doesn't exist anymore.

---

## ❌ STEP 4: DELETE DAILY-BRIEFING SCENARIOS

Look for scenarios calling the old daily-briefing endpoint:

- [ ] Any scenario calling `/api/email/daily-briefing`
- [ ] "Daily Briefing"
- [ ] "Generate Daily Briefing"

**Why delete?** This endpoint is archived. Dashboard now calls `/api/email/triaged-emails` directly.

---

## ❌ STEP 5: DELETE RAW.EMAILS SYNC SCENARIOS

Look for scenarios that write to `RAW.EMAILS` table:

- [ ] "Sync M365 to Snowflake RAW.EMAILS"
- [ ] "Populate RAW.EMAILS"
- [ ] Any scenario with Snowflake module writing to `SOVEREIGN_MIND.RAW.EMAILS`

**Why delete?** Only needed if using the alternative approach. Auto-Triage V2 goes straight to HIVE_MIND.

**Exception:** If your keeper scenario is calling `/api/email/auto-triage` (without "v2"), then you NEED the RAW.EMAILS sync. In that case, keep both scenarios.

---

## ❌ STEP 6: DELETE EMAIL_BRIEFING_RESULTS SCENARIOS

Look for scenarios writing to the old table:

- [ ] Any scenario with Snowflake module writing to `SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS`

**Why delete?** This table is completely deprecated. Dashboard doesn't read from it.

---

## 📊 FINAL TALLY

After cleanup, count your scenarios:

**Before cleanup:**
- Total email scenarios: _______
- Failing scenarios: _______
- Working scenarios: _______

**After cleanup:**
- Active scenarios: _______ (should be 1 or 2)
- Deleted scenarios: _______
- Disabled scenarios: _______

---

## ✅ VERIFICATION CHECKLIST

After cleanup, verify everything works:

- [ ] **Exactly ONE scenario** calling `/api/email/auto-triage-v2` (or TWO if using auto-triage + RAW.EMAILS sync)
- [ ] Scenario is **enabled (ON)**
- [ ] Scenario **runs every 5 minutes**
- [ ] Scenario execution history shows **no errors**
- [ ] Dashboard at **https://abbi-ai.com** shows emails
- [ ] New unread email appears in dashboard **within 10 minutes**
- [ ] Clicking "Mark as Read & Close" **removes email from dashboard**
- [ ] **No scenarios with folder names** in the title
- [ ] **No scenarios calling triage-webhook**
- [ ] **No scenarios calling daily-briefing**

---

## 🚨 TROUBLESHOOTING

### After cleanup, dashboard shows 0 emails

**Check 1:** Is the Auto-Triage V2 scenario running?
- Go to Make.com scenario
- Check "History" tab
- Should see executions every 5 minutes

**Check 2:** Are there errors in the execution?
- Click on an execution
- Look for red error boxes
- Common errors:
  - FUNCTION_INVOCATION_FAILED → Timeout issue
  - Tool not found → Gateway issue
  - Unauthorized → API key issue

**Check 3:** Are emails in HIVE_MIND table?
Run this query in Snowflake:
```sql
SELECT COUNT(*) as email_count
FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
WHERE CATEGORY = 'triaged_email'
  AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE);
```
- **If 0:** Triage isn't writing to HIVE_MIND (check scenario errors)
- **If >0:** Dashboard should show them (check browser console for errors)

**Check 4:** Is there a folder mismatch?
- Auto-Triage V2 only syncs 11 specific folders
- If your unread emails are in OTHER folders, they won't appear
- Solution: Add folders to auto-triage-v2.js (see MAKE_COM_CORRECT_SETUP.md)

### Scenario times out (FUNCTION_INVOCATION_FAILED)

**Cause:** Too many emails to process in 60 seconds
**Fix Options:**
1. Increase scenario frequency to every 3 minutes (process fewer emails per run)
2. Reduce batch size in auto-triage-v2.js
3. Clear old unread emails manually

### Want to restore a deleted scenario

**If you disabled instead of deleting:**
- Find scenario with `[DELETED]` prefix
- Toggle it back ON
- Remove `[DELETED]` prefix

**If you actually deleted:**
- You'll need to recreate it (see MAKE_COM_CORRECT_SETUP.md)

---

## 📸 BEFORE YOU START

**Recommendation:** Take screenshots of all your scenarios before deleting anything!

1. Go to Make.com scenarios page
2. Take screenshot of the full list
3. Click into each email-related scenario
4. Screenshot the configuration
5. Save screenshots to a folder: `Make_Backup_2026-01-26`

This way you can restore if needed.

---

## 🎯 DONE!

After following this checklist:
- ✅ Cleaned up Make.com scenarios
- ✅ Dashboard loads emails correctly
- ✅ Only ONE scenario for email triage
- ✅ No more failing scenarios

**Next time you add a folder:** Just edit `auto-triage-v2.js` - no Make.com changes needed!
