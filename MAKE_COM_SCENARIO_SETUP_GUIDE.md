# Make.com Scenario Setup Guide - Complete Configuration

**Created:** 2026-01-26
**Purpose:** Configure Make.com scenarios to sync all triage folders to SOVEREIGN_MIND.RAW.EMAILS

---

## 📊 OVERVIEW

**Total Scenarios Needed:** 36 scenarios (7 from jstewart@ + 29 from john@)

**Architecture:**
M365 Folders → Make.com Scenarios → SOVEREIGN_MIND.RAW.EMAILS → auto-triage.js → HIVE_MIND → Dashboard

---

## 📁 FOLDERS TO SYNC

### **jstewart@middleground.com** (7 folders)

| # | Folder Name | Path | Total Emails | Priority |
|---|-------------|------|--------------|----------|
| 1 | Inbox | Inbox | 91,625 | ⭐⭐⭐ |
| 2 | 000.1 Signature Request | Inbox/000.1 Signature Request | 163 | ⭐⭐ |
| 3 | 02.05 Dechert | Inbox/02.05 Dechert | 232 | ⭐⭐ |
| 4 | 02.3 IB, Banks and Lenders | Inbox/02.3 IB, Banks and Lenders | 3,355 | ⭐⭐⭐ |
| 5 | 02.4 CEO's | Inbox/02.4 CEO's | 662 | ⭐⭐⭐ |
| 6 | 02.1 Investor | 02.1 Investor | 709 | ⭐⭐⭐ |
| 7 | 02.2 Placement Agents | 02.2 Placement Agents | 327 | ⭐⭐ |

### **john@middleground.com** (29 folders)

| # | Folder Name | Path | Total Emails | Unread | Priority |
|---|-------------|------|--------------|--------|----------|
| 8 | Inbox | Inbox | 5,365 | 0 | ⭐⭐⭐ |
| 9 | 01.01 Shelby | 01.01 Shelby | 369 | 0 | ⭐⭐ |
| 10 | 01.02 Scot | 01.02 Scot | 230 | 0 | ⭐⭐ |
| 11 | 01.03 Chris | 01.03 Chris | 315 | 0 | ⭐⭐ |
| 12 | 01.04 Jackie | 01.04 Jackie | 224 | 2 | ⭐⭐⭐ |
| 13 | 01.06 Jon La | 01.06 Jon La | 212 | 1 | ⭐⭐⭐ |
| 14 | 01.07 Kelly | 01.07 Kelly | 190 | 0 | ⭐⭐ |
| 15 | 01.08 Dave Eubank | 01.08 Dave Eubank | 96 | 0 | ⭐ |
| 16 | 01.09 Ryan | 01.09 Ryan | 183 | 0 | ⭐⭐ |
| 17 | 01.10 Executive Travel | 01.10 Executive Travel | 2,152 | 0 | ⭐⭐⭐ |
| 18 | 01.11 MP Office | 01.11 MP Office | 2,236 | 0 | ⭐⭐⭐ |
| 19 | 01.12 COO Office | 01.12 COO Office | 948 | 0 | ⭐⭐⭐ |
| 20 | 01.13 MC | 01.13 MC | 2,689 | 4 | ⭐⭐⭐ |
| 21 | 01.19 Exit and Capital Market | 01.19 Exit and Capital Market | 49 | 0 | ⭐ |
| 22 | 01.20 IR | 01.20 IR | 1,612 | 4 | ⭐⭐⭐ |
| 23 | 01.21 BD | 01.21 BD | 414 | 1 | ⭐⭐⭐ |
| 24 | 01.22 MC Accounting | 01.22 MC Accounting | 576 | 1 | ⭐⭐⭐ |
| 25 | 01.23 Fund Accounting | 01.23 Fund Accounting | 189 | 0 | ⭐⭐ |
| 26 | 01.24 N Transaction Team | 01.24 N Transaction Team | 4,772 | 9 | ⭐⭐⭐ |
| 27 | 01.25 E Transaction Team | 01.25 E Transaction Team | 477 | 0 | ⭐⭐ |
| 28 | 01.26 N Operations Team | 01.26 N Operations Team | 1,233 | 8 | ⭐⭐⭐ |
| 29 | 01.27 E Operations Team | 01.27 E Operations Team | 32 | 0 | ⭐ |
| 30 | 01.28 Human Capital | 01.28 Human Capital | 1,243 | 4 | ⭐⭐⭐ |
| 31 | 01.29 Marketing | 01.29 Marketing | 626 | 0 | ⭐⭐ |
| 32 | 01.30 ESG | 01.30 ESG | 313 | 0 | ⭐⭐ |
| 33 | 01.31 Office Team | 01.31 Office Team | 338 | 1 | ⭐⭐ |
| 34 | 01.32 Associates | 01.32 Associates | 54 | 0 | ⭐ |
| 35 | 01.33 Valuation | 01.33 Valuation | 77 | 0 | ⭐ |
| 36 | 01.34 Support | 01.34 Support | 759 | 0 | ⭐⭐ |
| 37 | 01.35 IT | 01.35 IT | 207 | 0 | ⭐⭐ |
| 38 | 01.36 Portfolio Legal | 01.36 Portfolio Legal | 99 | 0 | ⭐ |

**Priority Legend:**
- ⭐⭐⭐ = High Priority (high volume or has unread)
- ⭐⭐ = Medium Priority
- ⭐ = Low Priority (low volume, no unread)

---

## 🔧 MAKE.COM SCENARIO TEMPLATE

### Scenario Naming Convention

**Format:** `Email (Outlook), Snowflake : [ACCOUNT] - [FOLDER NAME]`

**Examples:**
- `Email (Outlook), Snowflake : jstewart - Inbox`
- `Email (Outlook), Snowflake : john - 01.24 N Transaction Team`

### 4-Module Configuration

#### **Module 1: Schedule (Trigger)**
```
Module Type: Schedule
Interval: Every 10 minutes
Start time: Immediately
Time zone: America/New_York (EST)
```

#### **Module 2: Microsoft 365 Email - List Messages**
```
Connection: [Your M365 OAuth Connection]
User/Principal Name: [jstewart@middleground.com OR john@middleground.com]
Select from list: Messages from a Folder
Folder ID: [Use folder picker - see section below]
Filter Messages:
  - Is Read: No (unread only)
Maximum number of results: 50
```

**IMPORTANT - Folder Picker:**
- Click the folder dropdown in Make.com
- Navigate to the exact folder path
- For subfolder like "Inbox/000.1 Signature Request", expand Inbox first, then select the subfolder
- DO NOT type folder name manually

#### **Module 3: Microsoft 365 Email - Get Message Details**
```
Connection: [Same M365 Connection as Module 2]
User/Principal Name: [Same as Module 2]
Message ID: {{2.id}}
Get body content: Yes
Body type: HTML
```

#### **Module 4: Snowflake - Insert Row**
```
Connection: [Your Snowflake Connection]
Account: [Your Snowflake Account]
Warehouse: SOVEREIGN_MIND_WH
Database: SOVEREIGN_MIND
Schema: RAW
Table: EMAILS
Action: Insert a row
```

**Column Mappings (EXACT case-sensitive names):**

| Column Name | Value/Mapping | Example |
|-------------|---------------|---------|
| `OUTLOOK_MESSAGE_ID` | `{{3.id}}` | AAMkAGE3... |
| `SUBJECT` | `{{3.subject}}` | Q4 Board Meeting |
| `SENDER` | `{{3.from.emailAddress.name}}` | John Smith |
| `SENDER_EMAIL` | `{{3.from.emailAddress.address}}` | john@example.com |
| `FOLDER_NAME` | `"[folder name]"` | **HARDCODE** as string |
| `BODY_CONTENT` | `{{3.body.content}}` | Full HTML email body |
| `BODY_PREVIEW` | `{{3.bodyPreview}}` | First 140 chars |
| `RECEIVED_AT` | `{{3.receivedDateTime}}` | 2026-01-26T14:30:00Z |
| `TO_RECIPIENTS` | `{{3.toRecipients}}` | JSON array |
| `CC_RECIPIENTS` | `{{3.ccRecipients}}` | JSON array |
| `HAS_ATTACHMENTS` | `{{3.hasAttachments}}` | true/false |
| `IMPORTANCE` | `{{3.importance}}` | normal/high/low |
| `IS_READ` | `{{3.isRead}}` | true/false |

**Leave these EMPTY (auto-populate):**
- `ID` (auto UUID)
- `CREATED_AT` (auto timestamp)

**CRITICAL - FOLDER_NAME Field:**
- Must be hardcoded as a string literal
- For jstewart Inbox: `"Inbox"`
- For john Inbox: `"Inbox"` (same name, different account)
- For subfolders: `"000.1 Signature Request"` (NOT "Inbox/000.1 Signature Request")
- For numbered folders: `"01.24 N Transaction Team"`

---

## 🚀 STEP-BY-STEP SETUP

### Phase 1: Verify Existing Scenarios

1. **Login to Make.com** → Scenarios

2. **Check existing scenarios:**
   - Look for scenarios named: `Email (Outlook), Snowflake : [anything]`
   - These two were failing and should NOW work (schema fixed):
     * `Email (Outlook), Snowflake : 02.1 Investor`
     * `Email (Outlook), Snowflake : 000.1 Signature Request`

3. **Verify/Fix existing scenarios:**
   - Open each scenario
   - Check Module 4 (Snowflake) has ALL column mappings listed above
   - Ensure `SENDER_EMAIL`, `TO_RECIPIENTS`, `CC_RECIPIENTS`, `IS_READ` are mapped
   - Save if changes made
   - Click "Run once" to test

### Phase 2: Create Missing Scenarios

For each folder in the list above that doesn't have a scenario:

1. **Create new scenario:**
   - Click "Create a new scenario"
   - Name: `Email (Outlook), Snowflake : [account] - [folder name]`
   - Example: `Email (Outlook), Snowflake : john - 01.13 MC`

2. **Add Module 1 (Schedule):**
   - Search "Tools" → Select "Schedule"
   - Set interval: Every 10 minutes
   - Click OK

3. **Add Module 2 (List Messages):**
   - Search "Microsoft 365 Email"
   - Select "List Messages from a Folder"
   - Connection: Choose your M365 OAuth connection
   - User: **jstewart@middleground.com** OR **john@middleground.com**
   - Folder: Use the folder picker dropdown
   - Filter: Is Read = No
   - Max results: 50
   - Click OK

4. **Add Module 3 (Get Message Details):**
   - Search "Microsoft 365 Email"
   - Select "Get a Message"
   - Connection: Same as Module 2
   - User: Same as Module 2
   - Message ID: `{{2.id}}` (from Module 2)
   - Get body content: Yes
   - Body type: HTML
   - Click OK

5. **Add Module 4 (Snowflake Insert):**
   - Search "Snowflake"
   - Select "Insert a Row"
   - Connection: Your Snowflake connection
   - Warehouse: SOVEREIGN_MIND_WH
   - Database: SOVEREIGN_MIND
   - Schema: RAW
   - Table: EMAILS
   - Map ALL columns as shown in table above
   - **CRITICAL:** Hardcode `FOLDER_NAME` as a string
   - Click OK

6. **Save and Enable:**
   - Click Save (bottom right)
   - Toggle ON (top right)
   - Click "Run once" to test

7. **Verify Success:**
   - Check execution history - should show green checkmark
   - If error, click to see details

### Phase 3: Test and Verify

After creating all scenarios, verify in Snowflake:

```sql
-- Check all folders are syncing
SELECT FOLDER_NAME,
       COUNT(*) as email_count,
       MAX(RECEIVED_AT) as latest_email,
       MAX(CREATED_AT) as latest_upload
FROM SOVEREIGN_MIND.RAW.EMAILS
GROUP BY FOLDER_NAME
ORDER BY latest_upload DESC;
```

**Expected result:** You should see all 36 folders (or at least the ones with unread emails)

```sql
-- Check recent uploads (last hour)
SELECT FOLDER_NAME, COUNT(*) as new_emails
FROM SOVEREIGN_MIND.RAW.EMAILS
WHERE CREATED_AT >= DATEADD(hour, -1, CURRENT_TIMESTAMP())
GROUP BY FOLDER_NAME
ORDER BY new_emails DESC;
```

---

## 📋 SCENARIO CHECKLIST

Use this checklist to track your progress:

### **jstewart@middleground.com Scenarios**

- [ ] **jstewart - Inbox** (91,625 emails) ⭐⭐⭐
- [ ] **jstewart - 000.1 Signature Request** (163 emails) ⭐⭐ - EXISTING (was failing)
- [ ] **jstewart - 02.05 Dechert** (232 emails) ⭐⭐
- [ ] **jstewart - 02.3 IB, Banks and Lenders** (3,355 emails) ⭐⭐⭐
- [ ] **jstewart - 02.4 CEO's** (662 emails) ⭐⭐⭐
- [ ] **jstewart - 02.1 Investor** (709 emails) ⭐⭐⭐ - EXISTING (was failing)
- [ ] **jstewart - 02.2 Placement Agents** (327 emails) ⭐⭐

### **john@middleground.com Scenarios**

- [ ] **john - Inbox** (5,365 emails) ⭐⭐⭐
- [ ] **john - 01.01 Shelby** (369 emails) ⭐⭐
- [ ] **john - 01.02 Scot** (230 emails) ⭐⭐
- [ ] **john - 01.03 Chris** (315 emails) ⭐⭐
- [ ] **john - 01.04 Jackie** (224 emails, 2 unread) ⭐⭐⭐
- [ ] **john - 01.06 Jon La** (212 emails, 1 unread) ⭐⭐⭐
- [ ] **john - 01.07 Kelly** (190 emails) ⭐⭐
- [ ] **john - 01.08 Dave Eubank** (96 emails) ⭐
- [ ] **john - 01.09 Ryan** (183 emails) ⭐⭐
- [ ] **john - 01.10 Executive Travel** (2,152 emails) ⭐⭐⭐
- [ ] **john - 01.11 MP Office** (2,236 emails) ⭐⭐⭐
- [ ] **john - 01.12 COO Office** (948 emails) ⭐⭐⭐
- [ ] **john - 01.13 MC** (2,689 emails, 4 unread) ⭐⭐⭐
- [ ] **john - 01.19 Exit and Capital Market** (49 emails) ⭐
- [ ] **john - 01.20 IR** (1,612 emails, 4 unread) ⭐⭐⭐
- [ ] **john - 01.21 BD** (414 emails, 1 unread) ⭐⭐⭐
- [ ] **john - 01.22 MC Accounting** (576 emails, 1 unread) ⭐⭐⭐
- [ ] **john - 01.23 Fund Accounting** (189 emails) ⭐⭐
- [ ] **john - 01.24 N Transaction Team** (4,772 emails, 9 unread) ⭐⭐⭐
- [ ] **john - 01.25 E Transaction Team** (477 emails) ⭐⭐
- [ ] **john - 01.26 N Operations Team** (1,233 emails, 8 unread) ⭐⭐⭐
- [ ] **john - 01.27 E Operations Team** (32 emails) ⭐
- [ ] **john - 01.28 Human Capital** (1,243 emails, 4 unread) ⭐⭐⭐
- [ ] **john - 01.29 Marketing** (626 emails) ⭐⭐
- [ ] **john - 01.30 ESG** (313 emails) ⭐⭐
- [ ] **john - 01.31 Office Team** (338 emails, 1 unread) ⭐⭐
- [ ] **john - 01.32 Associates** (54 emails) ⭐
- [ ] **john - 01.33 Valuation** (77 emails) ⭐
- [ ] **john - 01.34 Support** (759 emails) ⭐⭐
- [ ] **john - 01.35 IT** (207 emails) ⭐⭐
- [ ] **john - 01.36 Portfolio Legal** (99 emails) ⭐

---

## 🚨 COMMON ERRORS & SOLUTIONS

### Error: "Column not found: SENDER_EMAIL"
**Status:** ✅ FIXED - Added missing columns to RAW.EMAILS table
**Action:** Verify your two failing scenarios now work

### Error: "Cannot insert NULL into OUTLOOK_MESSAGE_ID"
**Cause:** Mapping error in Module 4
**Fix:** Ensure `OUTLOOK_MESSAGE_ID` = `{{3.id}}` (from Module 3, not Module 2)

### Error: Duplicate key violation
**Cause:** Email already exists in RAW.EMAILS (normal behavior)
**Fix:** Add error handler:
1. Right-click Module 4
2. Add error handler
3. Choose "Resume" (continues to next email)
4. This prevents scenario from stopping on duplicates

### Error: "Folder not found"
**Cause:** Folder path incorrect or typed manually
**Fix:** Use the folder picker dropdown in Module 2, don't type folder name

### Error: Scenario timeout
**Cause:** Too many unread emails to process in one run
**Fix:** Reduce "Maximum number of results" in Module 2 from 50 to 25

### Error: Connection expired
**Cause:** OAuth token needs refresh
**Fix:**
1. Go to Connections
2. Find your M365 connection
3. Click "Reauthorize"
4. Follow OAuth flow

---

## 🔍 FOLDER_NAME SPECIAL CASES

### Both Accounts Have "Inbox"
- **jstewart Inbox:** Hardcode as `"Inbox"` in FOLDER_NAME
- **john Inbox:** Also hardcode as `"Inbox"` in FOLDER_NAME
- They'll both show as "Inbox" in RAW.EMAILS
- If you need to distinguish them, you could use:
  - `"jstewart Inbox"` and `"john Inbox"`
  - But verify this with auto-triage.js exclusion list

### Subfolders vs Root Folders
- **Subfolder example:** `Inbox/000.1 Signature Request`
  - FOLDER_NAME should be: `"000.1 Signature Request"` (NOT the full path)
- **Root folder example:** `02.1 Investor`
  - FOLDER_NAME should be: `"02.1 Investor"`

### Special Characters
- Folders with apostrophes: `02.4 CEO's`
  - Hardcode exactly as shown: `"02.4 CEO's"`
- Folders with commas: `02.3 IB, Banks and Lenders`
  - Hardcode exactly as shown: `"02.3 IB, Banks and Lenders"`

---

## ✅ FINAL VERIFICATION

After all scenarios are created and running:

1. **Check Make.com Dashboard:**
   - All 36 scenarios should show as "ON" (enabled)
   - Execution history should show green checkmarks
   - Check for any red X's (errors)

2. **Check Snowflake RAW.EMAILS:**
```sql
-- Should show 36+ folders
SELECT FOLDER_NAME, COUNT(*)
FROM SOVEREIGN_MIND.RAW.EMAILS
GROUP BY FOLDER_NAME
ORDER BY FOLDER_NAME;
```

3. **Wait 10-15 minutes, then check dashboard:**
   - Go to: https://abbi-ai-site.vercel.app/dashboards/executive/jstewart.html
   - Emails should appear from all folders
   - Categories should auto-populate

4. **Monitor for 24 hours:**
   - New emails should appear within 10 minutes of arrival
   - Check Make.com execution history for any errors
   - Verify no folders are being missed

---

## 📞 NEXT STEPS

1. **Fix the 2 failing scenarios first:**
   - Open "Email (Outlook), Snowflake : 02.1 Investor"
   - Open "Email (Outlook), Snowflake : 000.1 Signature Request"
   - Verify Module 4 has all column mappings
   - Test run each one

2. **Create the 29+ missing scenarios:**
   - Start with high priority (⭐⭐⭐) folders first
   - Use the checklist above to track progress
   - Test each scenario after creation

3. **Organize Make.com scenarios:**
   - Create folders in Make.com:
     * "Dashboard - jstewart" (7 scenarios)
     * "Dashboard - john" (29 scenarios)
   - Move scenarios into appropriate folders

4. **Document in Make.com:**
   - Add description to each scenario
   - Format: "Syncs [folder] from [account] to RAW.EMAILS every 10 minutes"

---

## 📚 RELATED DOCUMENTATION

- **CORRECT_TRIAGE_FLOW.md** - Complete Approach B architecture
- **COMPLETE_DATA_FLOW_V9.9.0.md** - Full system trace
- **api/email/README.md** - API file reference
- **JSTEWART_TRIAGE_FOLDER_M365_FOLDERS.md** - jstewart folder list
- **JOHN_Triage_FOLDER_M365_FOLDERS.md** - john folder list

---

**Last Updated:** 2026-01-26
**Dashboard Version:** v9.9.2
**Snowflake Table:** SOVEREIGN_MIND.RAW.EMAILS (schema fixed with 4 new columns)
