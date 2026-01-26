# Make.com Scenarios Audit Checklist

**Purpose:** Identify which Make.com scenarios are actively used by the dashboard vs legacy/unused

---

## STEP 1: Find All Scenarios Related to Email Triage

In Make.com, look for scenarios with these keywords:
- [ ] "triage"
- [ ] "auto-triage"
- [ ] "Snowflake"
- [ ] "RAW.EMAILS"
- [ ] "M365" or "Outlook"
- [ ] "email sync"
- [ ] "HIVE_MIND"

**List them here:**
1. ___________________________________
2. ___________________________________
3. ___________________________________
4. ___________________________________
5. ___________________________________

---

## STEP 2: Check Which Endpoints They Call

For each scenario, note what API endpoint it calls:

| Scenario Name | Endpoint URL | Status |
|--------------|--------------|--------|
| Example: "Daily Email Sync" | `https://abbi-ai.com/api/email/auto-triage` | Active |
|  |  |  |
|  |  |  |
|  |  |  |

---

## STEP 3: Identify Active vs Legacy

### ✅ REQUIRED (Mark as ACTIVE in Make.com)

**Dashboard needs ONE of these to feed triaged emails:**

**OPTION A: RAW.EMAILS Approach**
- [ ] Scenario that populates `SOVEREIGN_MIND.RAW.EMAILS` table from M365
- [ ] Scenario that calls `https://abbi-ai.com/api/email/auto-triage` (reads from RAW.EMAILS)

**OPTION B: Direct M365 Approach (RECOMMENDED - Simpler)**
- [ ] Scenario that calls `https://abbi-ai.com/api/email/auto-triage-v2` (reads directly from M365)

**Which approach are you using?**
- [ ] Option A (RAW.EMAILS)
- [ ] Option B (Direct M365)
- [ ] Not sure / Need to check

---

## STEP 4: Check Scenario Frequency

Active scenarios should run every **5-10 minutes** to keep dashboard updated.

| Scenario Name | Current Frequency | Recommended | Action Needed |
|--------------|-------------------|-------------|---------------|
|  | Every ___ minutes | Every 5-10 min |  |
|  | Every ___ minutes | Every 5-10 min |  |

---

## STEP 5: Check for Failed Scenarios

In Make.com, look at "History" or "Runs" tab:

**Scenarios with errors:**
1. Scenario: ___________________________________
   - Error: ___________________________________
   - Last successful run: ___________________________________

2. Scenario: ___________________________________
   - Error: ___________________________________
   - Last successful run: ___________________________________

---

## STEP 6: Label Active Scenarios

In Make.com, rename active scenarios to include prefix:

- [ ] `[ACTIVE - DASHBOARD] Run Auto-Triage V2`
- [ ] `[ACTIVE - DASHBOARD] Sync M365 to RAW.EMAILS`
- [ ] `[ACTIVE - DASHBOARD] ___________________________________`

---

## STEP 7: Archive/Disable Unused Scenarios

Scenarios that are NOT actively feeding the dashboard:

- [ ] Rename to `[ARCHIVED]` prefix
- [ ] Disable scenario (turn off)
- [ ] Document why it was archived

**Archived scenarios:**
1. ___________________________________
2. ___________________________________
3. ___________________________________

---

## COMMON ERRORS & FIXES

### Error: "Tool not found: sm_query_snowflake"
**Fix:** Endpoint URL may be wrong or gateway is down
- Check: `https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp`
- Verify tool exists: See ACTIVE_DASHBOARD_APIS.md

### Error: "Timeout after 300 seconds"
**Fix:** Triage process taking too long
- Check: How many emails are being processed per run?
- Reduce: Lower the batch size or increase frequency

### Error: "Invalid JSON response"
**Fix:** Snowflake query may be returning invalid data
- Check: HIVE_MIND table structure
- Verify: DETAILS column contains valid JSON

### Error: "FUNCTION_INVOCATION_FAILED"
**Fix:** Vercel function timeout (60 second limit on Pro plan)
- Check: Is the scenario calling an endpoint that takes >60s?
- Fix: Break into smaller batches or use background processing

---

## QUICK DECISION TREE

```
Do you have emails showing in the dashboard?
│
├─ YES → Check HIVE_MIND table in Snowflake
│   │     Query: SELECT COUNT(*) FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES WHERE CATEGORY = 'triaged_email'
│   │
│   ├─ Has rows → Triage process is working! ✅
│   │              Check which Make scenario is populating it
│   │
│   └─ Empty → Triage process is NOT running ❌
│                Check Make.com scenarios for errors
│
└─ NO → Either:
    1. No emails to triage (check M365 inbox)
    2. Triage process not running (check Make.com)
    3. HIVE_MIND table is empty (check database)
```

---

## NEED HELP?

**Check these files for details:**
1. `ACTIVE_DASHBOARD_APIS.md` - What the dashboard uses
2. `api/email/auto-triage-v2.js` - Which folders are synced (lines 103-115)
3. `api/email/auto-triage.js` - Which folders are excluded (lines 122-127)

**Test endpoints manually:**
```bash
# Test auto-triage-v2 (direct M365)
curl -X POST https://abbi-ai.com/api/email/auto-triage-v2

# Test triaged-emails (what dashboard calls)
curl https://abbi-ai.com/api/email/triaged-emails
```
