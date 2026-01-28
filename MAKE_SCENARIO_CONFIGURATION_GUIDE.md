# Make.com Scenario Configuration Guide

**Created:** 2026-01-26
**Purpose:** Complete guide to configure all Make.com scenarios for RAW.EMAILS upload

---

## 📊 CURRENT FOLDERS IN RAW.EMAILS

Based on Snowflake data, you currently have these folders with email counts:

| Folder Name | Email Count | Latest Email |
|-------------|-------------|--------------|
| Inbox | 674 | 2026-01-26 |
| 01.29 Marketing | 626 | 2025-12-22 |
| 01.21 BD | 413 | 2025-12-26 |
| 01.31 Office Team | 338 | 2026-01-23 |
| 01.30 ESG | 313 | 2026-01-16 |
| 01.35 IT | 208 | 2025-12-27 |
| 01.24 N Transaction Team | 163 | 2026-01-26 |
| Daily Liquidity | 161 | 2026-01-26 |
| 01.02 Scot | 113 | 2026-01-08 |
| 01.26 N Operations Team | 100 | 2026-01-23 |
| 01.04 Jackie | 68 | 2025-04-30 |
| 01.13 MC | 68 | 2026-01-26 |
| 000.1 Signature Request | 67 | 2025-12-27 |
| 01.12 COO Office | 66 | 2023-06-06 |
| 01.33 Valuation | 58 | 2025-09-15 |
| 01.32 Associates | 54 | 2025-08-18 |
| 01.08 Dave Eubank | 54 | 2025-09-16 |
| 01.11 MP Office | 50 | 2026-01-23 |
| 02.3 IB, Banks and Lenders | 47 | 2026-01-06 |
| 01.03 Chris | 41 | 2026-01-13 |
| 01.27 E Operations Team | 32 | 2025-12-17 |
| 01.34 Support | 27 | 2022-04-06 |
| 01.23 Fund Accounting | 26 | 2026-01-26 |
| 02.1 Investor | 24 | 2026-01-06 |
| 01.06 Jon La | 21 | 2026-01-05 |
| 02.05 Dechert | 20 | 2026-01-23 |
| 01.20 IR | 17 | 2026-01-26 |
| 01.25 E Transaction Team | 17 | 2026-01-14 |
| jstewart Inbox | 15 | 2025-12-30 |
| 01.09 Ryan | 14 | 2026-01-21 |
| inbox (lowercase) | 14 | 2025-12-11 |
| 01.07 Kelly | 13 | 2026-01-08 |
| 01.22 MC Accounting | 12 | 2026-01-23 |
| 01.36 Portfolio Legal | 11 | 2024-04-30 |
| 02.4 CEO's | 11 | 2025-12-23 |
| 01.28 Human Capital | 8 | 2026-01-26 |
| 02.4 CEOs | 6 | 2026-01-26 |
| 01.01 Shelby | 4 | 2026-01-09 |

**Total:** 38 different folders, 3,974 emails

---

## ✅ RECOMMENDED FOLDERS TO SYNC FOR DASHBOARD

Based on your current data and the folders you want in the dashboard:

### Priority Folders (Active & Recent)

1. **Inbox** ⭐ (674 emails, active today)
2. **01.01 John** (needs scenario - only has "01.01 Shelby")
3. **01.02 Scot** ✅ (113 emails, active Jan 8)
4. **01.03 Tom** (only has "01.03 Chris" - verify correct name)
5. **01.04 Kathryn** (only has "01.04 Jackie" - verify correct name)
6. **01.05 Will** (no data - needs scenario if folder exists)
7. **01.13 MC** ✅ (68 emails, active today)
8. **01.24 N Transaction Team** ✅ (163 emails, active today)
9. **01.26 N Operations Team** ✅ (100 emails, active Jan 23)
10. **01.28 Human Capital** ✅ (8 emails, active today)
11. **02.05 Dechert** ✅ (20 emails, active Jan 23)
12. **02.1 Investor** ✅ (24 emails, scenario was failing)
13. **000.1 Signature Request** ✅ (67 emails, scenario was failing)

### Additional Active Folders

14. **01.23 Fund Accounting** (26 emails, active today)
15. **01.20 IR** (17 emails, active today)
16. **01.22 MC Accounting** (12 emails, active Jan 23)
17. **01.11 MP Office** (50 emails, active Jan 23)
18. **01.21 BD** (413 emails, active Dec 26)

### Folders to EXCLUDE from Dashboard

- **Daily Liquidity** ❌ (161 emails - excluded in auto-triage.js)
- **01.31 Office Team** ❌ (338 emails - excluded in auto-triage.js)
- **01.29 Marketing** ❌ (626 emails - likely spam/FYI only)
- **01.30 ESG** ❌ (313 emails)
- **01.35 IT** ❌ (208 emails)

---

## 📋 MAKE.COM SCENARIO CONFIGURATION

### Template for Each Folder Scenario

**Scenario Name Format:** `Email (Outlook), Snowflake : [FOLDER NAME]`

Example: `Email (Outlook), Snowflake : Inbox`

### Module Configuration

#### Module 1: Schedule Trigger
```
Type: Schedule
Interval: Every 10 minutes
Time zone: America/New_York (EST)
```

#### Module 2: Microsoft 365 Email - List Messages
```
Connection: [Your M365 OAuth Connection]
User: jstewart@middleground.com
Folder: [Select folder from dropdown]
  → Example: "Inbox" or "01.01 John"
Filter Messages:
  - Is Read: No (unread only)
Maximum number of results: 50
```

**Important:** Use the folder picker in Make.com, don't type the folder name manually.

#### Module 3: Microsoft 365 Email - Get Message Details
```
Connection: [Same M365 Connection]
User: jstewart@middleground.com
Message ID: {{2.id}}
Get body content: Yes
Body type: HTML
```

#### Module 4: Snowflake - Insert Row
```
Connection: [Your Snowflake Connection]
Action: Insert a row
Database: SOVEREIGN_MIND
Schema: RAW
Table: EMAILS

Column Mappings (EXACT field names - case sensitive):
```

**CRITICAL: Use these EXACT column names and mappings:**

| Column Name | Mapping from M365 | Notes |
|-------------|-------------------|-------|
| `OUTLOOK_MESSAGE_ID` | `{{3.id}}` | Primary identifier |
| `SUBJECT` | `{{3.subject}}` | Email subject |
| `SENDER` | `{{3.from.emailAddress.name}}` | Sender display name |
| `SENDER_EMAIL` | `{{3.from.emailAddress.address}}` | Sender email |
| `FOLDER_NAME` | `"[folder name]"` | **HARDCODE** the folder name here |
| `BODY_CONTENT` | `{{3.body.content}}` | Full email body |
| `BODY_PREVIEW` | `{{3.bodyPreview}}` | Preview text |
| `RECEIVED_AT` | `{{3.receivedDateTime}}` | Received timestamp |
| `TO_RECIPIENTS` | `{{3.toRecipients}}` | JSON array |
| `CC_RECIPIENTS` | `{{3.ccRecipients}}` | JSON array |
| `HAS_ATTACHMENTS` | `{{3.hasAttachments}}` | Boolean |
| `IMPORTANCE` | `{{3.importance}}` | normal/high/low |
| `IS_READ` | `{{3.isRead}}` | Boolean |

**Leave these columns EMPTY** (they auto-populate):
- `ID` (auto UUID)
- `CREATED_AT` (auto timestamp)
- `RECIPIENTS` (legacy - not used)

---

## 🎯 STEP-BY-STEP SETUP FOR EACH FOLDER

### Step 1: List Your Desired Folders

Check off the folders you want in your dashboard:

- [ ] Inbox
- [ ] 01.01 John (verify this name in M365)
- [ ] 01.02 Scot
- [ ] 01.03 Tom (verify - you have "01.03 Chris")
- [ ] 01.04 Kathryn (verify - you have "01.04 Jackie")
- [ ] 01.05 Will
- [ ] 01.13 MC
- [ ] 01.24 N Transaction Team
- [ ] 01.26 N Operations Team
- [ ] 01.28 Human Capital
- [ ] 02.05 Dechert
- [ ] 02.1 Investor
- [ ] 000.1 Signature Request
- [ ] 01.11 MP Office
- [ ] 01.20 IR
- [ ] 01.21 BD
- [ ] 01.22 MC Accounting
- [ ] 01.23 Fund Accounting

### Step 2: For Each Checked Folder

1. **Open Make.com** → Scenarios

2. **Check if scenario exists:**
   - Search for: `Email (Outlook), Snowflake : [folder name]`
   - If exists: Open it and verify configuration (see below)
   - If not: Create new scenario

3. **If creating new scenario:**
   - Click "Create a new scenario"
   - Name: `Email (Outlook), Snowflake : [folder name]`
   - Add 4 modules as shown above
   - **CRITICAL:** In Module 4 (Snowflake Insert), use exact column names
   - **CRITICAL:** In `FOLDER_NAME` column, hardcode the folder name as a string

4. **Save and enable:**
   - Click Save (bottom right)
   - Toggle ON (top right)
   - Click "Run once" to test

5. **Verify success:**
   - Check execution history - should show green checkmark
   - Go to Snowflake and run:
     ```sql
     SELECT * FROM SOVEREIGN_MIND.RAW.EMAILS
     WHERE FOLDER_NAME = '[your folder name]'
     ORDER BY CREATED_AT DESC
     LIMIT 5;
     ```

### Step 3: Fix Failing Scenarios

Your two failing scenarios should now work because we added the missing columns:

1. **Email (Outlook), Snowflake : 02.1 Investor**
   - Open scenario
   - Check Module 4 (Snowflake) column mappings
   - Verify these columns exist and are mapped:
     * SENDER_EMAIL = `{{3.from.emailAddress.address}}`
     * TO_RECIPIENTS = `{{3.toRecipients}}`
     * CC_RECIPIENTS = `{{3.ccRecipients}}`
     * IS_READ = `{{3.isRead}}`
   - Save and test

2. **Email (Outlook), Snowflake : 000.1 Signature Request**
   - Same verification as above

---

## 🚨 COMMON ERRORS & FIXES

### Error: "Column not found: SENDER_EMAIL"
**Fix:** Table was missing columns. ✅ FIXED - we added them.

### Error: "Data type mismatch"
**Fix:**
- TO_RECIPIENTS and CC_RECIPIENTS must be VARIANT (JSON), not VARCHAR
- IS_READ must be BOOLEAN, not VARCHAR
- ✅ FIXED - columns have correct types

### Error: "Cannot insert NULL into OUTLOOK_MESSAGE_ID"
**Fix:** Make sure Module 3 mapping is `{{3.id}}` not `{{2.id}}`

### Error: Scenario times out
**Fix:**
- Reduce "Maximum number of results" in Module 2 to 25 instead of 50
- Check if folder has thousands of unread emails

### Error: "Folder not found"
**Fix:**
- Use the folder picker in Make.com Module 2
- Don't type folder name manually
- Folder names are case-sensitive

### Error: Duplicate key violation
**Fix:**
- RAW.EMAILS already has this email
- This is normal and can be ignored
- Or add error handler: "Resume" → continue to next email

---

## ✅ VERIFICATION CHECKLIST

After setting up all scenarios:

- [ ] All desired folder scenarios exist in Make.com
- [ ] All scenarios are enabled (ON)
- [ ] All scenarios run every 10 minutes
- [ ] Test run shows green checkmark (success)
- [ ] Snowflake RAW.EMAILS table has recent data from each folder
- [ ] No error emails from Make.com
- [ ] Dashboard shows emails from all folders within 15 minutes

### SQL Verification Queries

**Check all folders in RAW.EMAILS:**
```sql
SELECT FOLDER_NAME,
       COUNT(*) as email_count,
       MAX(RECEIVED_AT) as latest_email,
       MAX(CREATED_AT) as latest_upload
FROM SOVEREIGN_MIND.RAW.EMAILS
GROUP BY FOLDER_NAME
ORDER BY latest_upload DESC;
```

**Check recent uploads (last 24 hours):**
```sql
SELECT FOLDER_NAME, COUNT(*) as new_emails
FROM SOVEREIGN_MIND.RAW.EMAILS
WHERE CREATED_AT >= DATEADD(hour, -24, CURRENT_TIMESTAMP())
GROUP BY FOLDER_NAME
ORDER BY new_emails DESC;
```

**Check if failing folders are now working:**
```sql
SELECT COUNT(*) as count,
       MAX(CREATED_AT) as latest_upload
FROM SOVEREIGN_MIND.RAW.EMAILS
WHERE FOLDER_NAME IN ('02.1 Investor', '000.1 Signature Request')
  AND CREATED_AT >= DATEADD(hour, -1, CURRENT_TIMESTAMP());
```

---

## 📝 FOLDER NAME VERIFICATION

Based on your current data, you have some name mismatches. Please verify in M365 which is correct:

| Expected Name (from docs) | Actual Name (in data) | Action Needed |
|---------------------------|----------------------|---------------|
| 01.01 John | 01.01 Shelby | ❓ Which is correct? |
| 01.03 Tom | 01.03 Chris | ❓ Which is correct? |
| 01.04 Kathryn | 01.04 Jackie | ❓ Which is correct? |
| 02.4 CEOs | 02.4 CEO's (both exist!) | ❓ Consolidate? |

**To check:** Go to Outlook → View folder list → Compare with table above

---

## 🔄 NEXT STEPS

1. **Verify folder names** in M365 (check the list above)
2. **Fix the two failing scenarios** (02.1 Investor, 000.1 Signature Request)
3. **Create missing scenarios** for folders that should be synced
4. **Test each scenario** with "Run once"
5. **Wait 10 minutes** and check if new emails appear in RAW.EMAILS
6. **Check dashboard** - emails should appear within 5 minutes after that

Once all Make.com upload scenarios are working:
- ✅ Auto-triage scenario will process them every 5 minutes
- ✅ Dashboard will show them immediately
- ✅ No more manual uploads needed

---

## 📞 TROUBLESHOOTING

If a specific folder scenario keeps failing:

1. Check Make.com execution history for detailed error
2. Verify folder name exactly matches M365 (case-sensitive)
3. Test Snowflake connection in Make.com
4. Try reducing batch size (Module 2: max results = 25)
5. Check if folder has special characters or permissions issues

**Need help?** Check:
- COMPLETE_DATA_FLOW_V9.9.0.md - full system architecture
- CORRECT_TRIAGE_FLOW.md - your Approach B flow
- api/email/README.md - API file reference
