# Correct Triage Flow - APPROACH B (RAW.EMAILS)

**Date:** 2026-01-26
**Correction:** User is using APPROACH B, not APPROACH A

---

## ✅ YOUR ACTUAL FLOW (Approach B)

```
Step 1: Make.com Scenarios Upload Raw Emails
┌─────────────────────────────────────────────────┐
│ Multiple Make.com scenarios (one per folder):   │
│ - Read emails from M365 folder                  │
│ - Upload to SOVEREIGN_MIND.RAW.EMAILS table     │
│                                                  │
│ Examples:                                        │
│ - "Email (Outlook), Snowflake : 02.1 Investor"  │
│ - "Email (Outlook), Snowflake : 000.1..."       │
│ - One scenario per folder you want synced       │
└─────────────────────────────────────────────────┘
                      ↓
Step 2: RAW.EMAILS Table (Snowflake)
┌─────────────────────────────────────────────────┐
│ SOVEREIGN_MIND.RAW.EMAILS                       │
│ - Stores raw email data from M365               │
│ - No AI analysis yet                            │
│ - Just the email content                        │
└─────────────────────────────────────────────────┘
                      ↓
Step 3: Make.com Calls Auto-Triage
┌─────────────────────────────────────────────────┐
│ One Make.com scenario:                          │
│ - Calls /api/email/auto-triage every 5 min     │
│ - Reads from RAW.EMAILS                         │
│ - Processes with AI                             │
└─────────────────────────────────────────────────┘
                      ↓
Step 4: Triage with AI
┌─────────────────────────────────────────────────┐
│ auto-triage.js                                  │
│ - Reads untriaged emails from RAW.EMAILS       │
│ - Calls triage.js for each email               │
│ - triage.js uses Claude AI to analyze          │
│ - Determines: spam, priority, category, etc.   │
└─────────────────────────────────────────────────┘
                      ↓
Step 5: Write to HIVE_MIND
┌─────────────────────────────────────────────────┐
│ SOVEREIGN_MIND.HIVE_MIND.ENTRIES                │
│ - Stores triaged emails with AI analysis       │
│ - CATEGORY = 'triaged_email'                   │
│ - Includes summary, priority, action items     │
└─────────────────────────────────────────────────┘
                      ↓
Step 6: Dashboard Display
┌─────────────────────────────────────────────────┐
│ Dashboard calls /api/email/triaged-emails      │
│ - Reads from HIVE_MIND                         │
│ - Shows processed emails to user               │
└─────────────────────────────────────────────────┘
```

---

## 🗄️ SOVEREIGN_MIND.RAW.EMAILS TABLE SCHEMA

This is the table your Make.com scenarios should write to:

```sql
CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.RAW.EMAILS (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    OUTLOOK_MESSAGE_ID STRING,
    SUBJECT STRING,
    SENDER STRING,
    SENDER_EMAIL STRING,
    FOLDER_NAME STRING,
    BODY_CONTENT STRING,
    BODY_PREVIEW STRING,
    RECEIVED_AT TIMESTAMP_NTZ,
    TO_RECIPIENTS VARIANT,
    CC_RECIPIENTS VARIANT,
    HAS_ATTACHMENTS BOOLEAN,
    IMPORTANCE STRING,
    IS_READ BOOLEAN,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);
```

**Key Fields:**
- `OUTLOOK_MESSAGE_ID` - M365 message ID (important for deduplication)
- `SUBJECT` - Email subject
- `SENDER` - Sender display name
- `SENDER_EMAIL` - Sender email address
- `FOLDER_NAME` - Which M365 folder (e.g., "02.1 Investor")
- `BODY_CONTENT` - Full email body (HTML or text)
- `BODY_PREVIEW` - Short preview text
- `RECEIVED_AT` - When email was received in M365

---

## 📋 REQUIRED MAKE.COM SCENARIOS (Your Approach)

### Group 1: Upload Raw Emails (Multiple Scenarios)

**Purpose:** Each scenario uploads emails from ONE M365 folder to RAW.EMAILS table

**Scenarios You Should Have:**
1. "Email (Outlook), Snowflake : Inbox"
2. "Email (Outlook), Snowflake : 01.01 John"
3. "Email (Outlook), Snowflake : 01.02 Scot"
4. "Email (Outlook), Snowflake : 01.03 Tom"
5. "Email (Outlook), Snowflake : 01.04 Kathryn"
6. "Email (Outlook), Snowflake : 01.05 Will"
7. "Email (Outlook), Snowflake : 01.13 MC"
8. "Email (Outlook), Snowflake : 01.24 N Transaction Team"
9. "Email (Outlook), Snowflake : 01.26 N Operations Team"
10. "Email (Outlook), Snowflake : 01.28 Human Capital"
11. "Email (Outlook), Snowflake : 02.05 Dechert"

**Plus any additional folders you want:**
- "Email (Outlook), Snowflake : 02.1 Investor" ✅ KEEP THIS
- "Email (Outlook), Snowflake : 000.1 Signature Request" ✅ KEEP THIS

**Configuration for Each:**
```
Module 1: Schedule
- Every 10 minutes

Module 2: M365 - List Messages
- Folder: [folder name]
- Filter: unread_only = true
- Limit: 50

Module 3: M365 - Get Message Details
- Message ID: {{2.id}}
- Get full body

Module 4: Snowflake - Insert Row
- Table: SOVEREIGN_MIND.RAW.EMAILS
- Columns:
  * OUTLOOK_MESSAGE_ID = {{3.id}}
  * SUBJECT = {{3.subject}}
  * SENDER = {{3.from.emailAddress.name}}
  * SENDER_EMAIL = {{3.from.emailAddress.address}}
  * FOLDER_NAME = "[folder name]"
  * BODY_CONTENT = {{3.body.content}}
  * BODY_PREVIEW = {{3.bodyPreview}}
  * RECEIVED_AT = {{3.receivedDateTime}}
  * TO_RECIPIENTS = {{3.toRecipients}}
  * CC_RECIPIENTS = {{3.ccRecipients}}
  * HAS_ATTACHMENTS = {{3.hasAttachments}}
  * IMPORTANCE = {{3.importance}}
  * IS_READ = {{3.isRead}}
```

### Group 2: Process Uploaded Emails (ONE Scenario)

**Scenario Name:** `[ACTIVE - DASHBOARD] Auto-Triage from RAW.EMAILS`

**Configuration:**
```
Module 1: Schedule
- Every 5 minutes

Module 2: HTTP Request
- URL: https://abbi-ai.com/api/email/auto-triage
- Method: POST
- Body: {}
- Timeout: 300 seconds
```

**What it does:**
- Reads from RAW.EMAILS table
- Calls triage.js to analyze with AI
- Writes to HIVE_MIND table
- Excludes folders in exclusion list

---

## ⚠️ WHY YOUR SCENARIOS ARE FAILING

The scenarios "02.1 Investor" and "000.1 Signature Request" are failing at the Snowflake insert because:

**Possible Issues:**
1. **Table doesn't exist:** `SOVEREIGN_MIND.RAW.EMAILS` table not created
2. **Schema mismatch:** Column names don't match
3. **Wrong table:** Writing to `RAW.EMAIL_BRIEFING_RESULTS` instead (old table)
4. **Permissions:** No write access to RAW.EMAILS table
5. **Data type mismatch:** Trying to insert wrong data types

---

## 🔧 HOW TO FIX THE FAILING SCENARIOS

### Step 1: Check if RAW.EMAILS Table Exists

Run in Snowflake:
```sql
SHOW TABLES LIKE 'EMAILS' IN SOVEREIGN_MIND.RAW;

-- If it exists, check schema:
DESCRIBE TABLE SOVEREIGN_MIND.RAW.EMAILS;

-- Check if it has data:
SELECT COUNT(*) FROM SOVEREIGN_MIND.RAW.EMAILS;
```

### Step 2: Create Table if Missing

If table doesn't exist:
```sql
CREATE TABLE SOVEREIGN_MIND.RAW.EMAILS (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    OUTLOOK_MESSAGE_ID STRING,
    SUBJECT STRING,
    SENDER STRING,
    SENDER_EMAIL STRING,
    FOLDER_NAME STRING,
    BODY_CONTENT STRING,
    BODY_PREVIEW STRING,
    RECEIVED_AT TIMESTAMP_NTZ,
    TO_RECIPIENTS VARIANT,
    CC_RECIPIENTS VARIANT,
    HAS_ATTACHMENTS BOOLEAN,
    IMPORTANCE STRING,
    IS_READ BOOLEAN,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);
```

### Step 3: Fix Make.com Scenario Configuration

For each failing scenario:
1. Open the scenario in Make.com
2. Check the Snowflake "Insert Row" module
3. Verify:
   - Table name: `SOVEREIGN_MIND.RAW.EMAILS`
   - All column names match the schema above
   - Data types match (VARIANT for JSON, TIMESTAMP_NTZ for dates)
4. Save and re-run

---

## 🎯 WHAT TO DO ABOUT "DAILY LIQUIDITY" FOLDER

Since you don't want "Daily Liquidity" folder in dashboard:

**Option 1: Don't create a Make.com scenario for it**
- No scenario = no uploads to RAW.EMAILS
- Simple!

**Option 2: Create scenario but exclude in auto-triage.js**
- Already done! Lines 123-130 exclude "Daily Liquidity"
- The folder will upload to RAW.EMAILS but won't be processed

---

## 📊 VERIFICATION CHECKLIST

After fixing:

- [ ] RAW.EMAILS table exists in Snowflake
- [ ] Table has correct schema (match columns above)
- [ ] Make.com scenarios for each folder run without errors
- [ ] RAW.EMAILS table has recent emails (`SELECT COUNT(*) FROM SOVEREIGN_MIND.RAW.EMAILS WHERE RECEIVED_AT > CURRENT_DATE`)
- [ ] Auto-triage scenario runs every 5 minutes
- [ ] Auto-triage calls `/api/email/auto-triage` (not auto-triage-v2)
- [ ] HIVE_MIND table has triaged emails
- [ ] Dashboard shows emails

---

## ⚠️ I APOLOGIZE FOR THE CONFUSION

I was telling you to:
- ❌ Delete the per-folder scenarios (WRONG - you need them!)
- ❌ Use auto-triage-v2 (WRONG - you're using auto-triage!)
- ❌ Have only ONE Make.com scenario (WRONG - you need multiple!)

**Correct setup for YOUR approach:**
- ✅ Multiple Make.com scenarios (one per folder) uploading to RAW.EMAILS
- ✅ One Make.com scenario calling /api/email/auto-triage
- ✅ Exclude unwanted folders in auto-triage.js code (already done)

---

## 🔄 ALTERNATIVE: SWITCH TO APPROACH A

If you want to simplify (like I was describing), you CAN switch to Approach A:

**Benefits:**
- Only ONE Make.com scenario needed
- No RAW.EMAILS table needed
- Simpler setup

**To switch:**
1. Delete all per-folder scenarios
2. Create ONE scenario calling `/api/email/auto-triage-v2`
3. Update folder list in auto-triage-v2.js to include your folders

But if your current setup is working (except for those two failing), just fix them!
