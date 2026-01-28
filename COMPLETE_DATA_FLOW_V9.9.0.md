# Complete Data Flow - Dashboard v9.9.0

**Created:** 2026-01-26
**Dashboard Version:** v9.9.0 (v9.9.4 in production)
**Purpose:** Complete trace of how data flows from M365 to your dashboard

---

## 📊 EXECUTIVE SUMMARY

Your dashboard uses **Approach B: RAW.EMAILS Table** architecture:

1. **Multiple Make.com scenarios** upload emails from M365 folders → `SOVEREIGN_MIND.RAW.EMAILS`
2. **One Make.com scenario** calls `/api/email/auto-triage` every 5 minutes
3. **auto-triage.js** reads from RAW.EMAILS → calls **triage.js** → writes to `SOVEREIGN_MIND.HIVE_MIND.ENTRIES`
4. **Dashboard** loads from HIVE_MIND on page load

---

## 🔄 COMPLETE DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: M365 SOURCE DATA (Microsoft 365 / Outlook)                  │
│ User: jstewart@middleground.com                                     │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
        M365 Folders with unread emails:
        • Inbox
        • 01.01 John
        • 01.02 Scot
        • 01.03 Tom
        • 01.04 Kathryn
        • 01.05 Will
        • 01.13 MC
        • 01.24 N Transaction Team
        • 01.26 N Operations Team
        • 01.28 Human Capital
        • 02.05 Dechert
        • 02.1 Investor
        • 000.1 Signature Request
        • [Any other folders you create scenarios for]
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: MAKE.COM UPLOAD SCENARIOS (Multiple Scenarios)              │
│ One scenario per folder                                             │
└─────────────────────────────────────────────────────────────────────┘

**Configuration for EACH folder scenario:**

Module 1: Schedule Trigger
  - Every 10 minutes

Module 2: M365 - List Messages
  - Connection: M365 OAuth connection
  - User: jstewart@middleground.com
  - Folder: [specific folder name]
  - Filter: unread_only = true
  - Limit: 50

Module 3: M365 - Get Message Details
  - Message ID: {{2.id}} (from previous module)
  - Get full body content

Module 4: Snowflake - Insert Row
  - Connection: Snowflake OAuth connection
  - Database: SOVEREIGN_MIND
  - Schema: RAW
  - Table: EMAILS
  - Insert Mode: Insert new record
  - Columns mapped:
    * OUTLOOK_MESSAGE_ID = {{3.id}}
    * SUBJECT = {{3.subject}}
    * SENDER = {{3.from.emailAddress.name}}
    * SENDER_EMAIL = {{3.from.emailAddress.address}}
    * FOLDER_NAME = "[folder name]" (hardcoded per scenario)
    * BODY_CONTENT = {{3.body.content}}
    * BODY_PREVIEW = {{3.bodyPreview}}
    * RECEIVED_AT = {{3.receivedDateTime}}
    * TO_RECIPIENTS = {{3.toRecipients}} (as JSON)
    * CC_RECIPIENTS = {{3.ccRecipients}} (as JSON)
    * HAS_ATTACHMENTS = {{3.hasAttachments}}
    * IMPORTANCE = {{3.importance}}
    * IS_READ = {{3.isRead}}

**Result:** Raw emails uploaded to Snowflake

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: SNOWFLAKE RAW.EMAILS TABLE                                  │
│ Database: SOVEREIGN_MIND                                            │
│ Schema: RAW                                                         │
│ Table: EMAILS                                                       │
└─────────────────────────────────────────────────────────────────────┘

**Table Schema:**
```sql
CREATE TABLE SOVEREIGN_MIND.RAW.EMAILS (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    OUTLOOK_MESSAGE_ID STRING,           -- M365 message ID
    SUBJECT STRING,                       -- Email subject
    SENDER STRING,                        -- Sender display name
    SENDER_EMAIL STRING,                  -- Sender email address
    FOLDER_NAME STRING,                   -- Which M365 folder
    BODY_CONTENT STRING,                  -- Full email body (HTML or text)
    BODY_PREVIEW STRING,                  -- Short preview text
    RECEIVED_AT TIMESTAMP_NTZ,            -- When email was received
    TO_RECIPIENTS VARIANT,                -- JSON array of To: recipients
    CC_RECIPIENTS VARIANT,                -- JSON array of CC: recipients
    HAS_ATTACHMENTS BOOLEAN,              -- Has attachments?
    IMPORTANCE STRING,                    -- normal, high, low
    IS_READ BOOLEAN,                      -- Read status in M365
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);
```

**Data Example:**
```
OUTLOOK_MESSAGE_ID: AAMkAGI1...
SUBJECT: "Q4 Investor Update"
SENDER: "John Smith"
SENDER_EMAIL: "john@example.com"
FOLDER_NAME: "02.1 Investor"
BODY_CONTENT: "<html>...</html>"
RECEIVED_AT: 2026-01-26 14:30:00
```

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: MAKE.COM AUTO-TRIAGE TRIGGER (One Scenario)                │
│ Scenario Name: [ACTIVE - DASHBOARD] Auto-Triage from RAW.EMAILS    │
└─────────────────────────────────────────────────────────────────────┘

Module 1: Schedule Trigger
  - Every 5 minutes

Module 2: HTTP Request
  - URL: https://abbi-ai.com/api/email/auto-triage
  - Method: POST
  - Body: {}
  - Timeout: 300 seconds (5 minutes)

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: AUTO-TRIAGE.JS API ENDPOINT                                 │
│ File: /api/email/auto-triage.js                                    │
│ Endpoint: POST /api/email/auto-triage                              │
│ Max Duration: 300 seconds                                           │
└─────────────────────────────────────────────────────────────────────┘

**What it does:**

1. **Query HIVE_MIND** for already triaged emails (lines 96-106):
   ```sql
   SELECT DETAILS:outlook_message_id::string as outlook_message_id
   FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
   WHERE CATEGORY = 'triaged_email'
   ```
   → Gets list of already-processed message IDs

2. **Query RAW.EMAILS** for recent emails (lines 108-117):
   ```sql
   SELECT ID, OUTLOOK_MESSAGE_ID, SUBJECT, SENDER, FOLDER_NAME,
          BODY_CONTENT, BODY_PREVIEW, RECEIVED_AT
   FROM SOVEREIGN_MIND.RAW.EMAILS
   WHERE RECEIVED_AT >= DATEADD(day, -7, CURRENT_TIMESTAMP())
   ORDER BY RECEIVED_AT DESC
   LIMIT 100
   ```
   → Gets last 7 days of uploaded emails

3. **Filter emails** (lines 122-145):
   - Skip if already in triagedIds set
   - Skip if from excluded folders:
     * Daily Liquidity
     * Sent Items
     * Deleted Items
     * Drafts
     * Junk Email
     * 01.31 Office Team

4. **Process each email** (lines 168-208):
   - Calls `/api/email/triage` for AI analysis
   - If spam → delete from M365
   - If real → mark as read in M365
   - Rate limit: 2 second delay between emails
   - Batch size: 10 emails per run

5. **Return results** (lines 222-230):
   ```json
   {
     "success": true,
     "emails_triaged": 5,
     "emails_deleted": 2,
     "emails_marked_read": 5,
     "errors": 0,
     "processing_time": "45.2s"
   }
   ```

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 6: TRIAGE.JS - AI ANALYSIS                                     │
│ File: /api/email/triage.js                                         │
│ Endpoint: POST /api/email/triage                                   │
└─────────────────────────────────────────────────────────────────────┘

**Input:**
```json
{
  "email": {
    "id": "...",
    "outlook_message_id": "AAMkAGI1...",
    "subject": "Q4 Investor Update",
    "sender": "John Smith",
    "folder_name": "02.1 Investor",
    "body_content": "...",
    "received_at": "2026-01-26T14:30:00Z",
    "recipient_email": "jstewart@middleground.com"
  }
}
```

**Processing:**

1. **Call Claude AI** (lines 14-72):
   - Model: `claude-sonnet-4-20250514`
   - Max tokens: 4000
   - Analyzes email for:
     * Spam detection
     * Classification (To: or CC:)
     * Priority (HIGH or NORMAL)
     * Tag (Needs Response or FYI)
     * Summary with Background, Purpose, Key Points
     * Action items
     * Attachments

2. **If spam** (lines 82-151):
   - Delete from M365 via `m365_delete_email` tool
   - Mark as read via `m365_mark_read` tool
   - Return action = 'delete'
   - Does NOT write to HIVE_MIND

3. **If real email** (lines 153-242):
   - Build emailDetails object
   - Write to HIVE_MIND via Snowflake INSERT (line 189):
     ```sql
     INSERT INTO SOVEREIGN_MIND.HIVE_MIND.ENTRIES
       (CATEGORY, SOURCE, SUMMARY, DETAILS, PRIORITY, WORKSTREAM)
     SELECT 'triaged_email', 'email-triage-api', '[summary]',
            PARSE_JSON('[details_json]'), 'HIGH', 'email'
     ```
   - Mark as read in M365
   - Return action = 'triaged'

**Output for real email:**
```json
{
  "success": true,
  "action": "triaged",
  "triage": {
    "is_spam": false,
    "classification": "To:",
    "priority": "HIGH",
    "tag": "Needs Response",
    "from_name": "John Smith",
    "from_email": "john@example.com",
    "summary": "- **Background:** Q4 reporting\n\n- **Purpose:** Share results\n\n- **Key Points:**\n  - Revenue up 15%\n  - New investments",
    "action_items": ["Review Q4 report", "Schedule follow-up"],
    "attachments": []
  },
  "hive_mind_saved": true,
  "marked_read": true
}
```

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 7: SNOWFLAKE HIVE_MIND TABLE                                   │
│ Database: SOVEREIGN_MIND                                            │
│ Schema: HIVE_MIND                                                   │
│ Table: ENTRIES                                                      │
└─────────────────────────────────────────────────────────────────────┘

**Table Schema:**
```sql
CREATE TABLE SOVEREIGN_MIND.HIVE_MIND.ENTRIES (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    CATEGORY STRING,                      -- 'triaged_email'
    SOURCE STRING,                        -- 'email-triage-api'
    SUMMARY STRING,                       -- Brief summary
    DETAILS VARIANT,                      -- Full JSON object
    PRIORITY STRING,                      -- 'HIGH' or 'NORMAL'
    WORKSTREAM STRING,                    -- 'email'
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);
```

**DETAILS JSON Structure:**
```json
{
  "email_id": "...",
  "outlook_message_id": "AAMkAGI1...",
  "folder_name": "02.1 Investor",
  "subject": "Q4 Investor Update",
  "from_name": "John Smith",
  "from_email": "john@example.com",
  "to_recipients": ["Jane Doe <jane@example.com>"],
  "cc_recipients": [],
  "received_at": "2026-01-26T14:30:00Z",
  "classification": "To:",
  "priority": "HIGH",
  "tag": "Needs Response",
  "summary": "- **Background:** ...\n\n- **Purpose:** ...",
  "action_items": ["Review Q4 report"],
  "attachments": [],
  "conversation_context": "Reply to previous thread",
  "has_attachments": false,
  "processed_at": "2026-01-26T15:00:00Z",
  "processed": false
}
```

**Important Fields:**
- `CATEGORY = 'triaged_email'` - Dashboard filters on this
- `DETAILS:processed` - NULL or FALSE means unprocessed (shows in dashboard)
- `DETAILS:outlook_message_id` - Links back to M365 email

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 8: DASHBOARD LOADS DATA                                        │
│ File: /dashboards/executive/jstewart.html                          │
│ On page load or refresh button click                               │
└─────────────────────────────────────────────────────────────────────┘

**Dashboard calls (lines 3162, 3895):**
```javascript
const res = await fetch(`/api/email/triaged-emails`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
});
```

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 9: TRIAGED-EMAILS.JS API                                       │
│ File: /api/email/triaged-emails.js                                 │
│ Endpoint: GET /api/email/triaged-emails                            │
└─────────────────────────────────────────────────────────────────────┘

**What it does:**

1. **Query HIVE_MIND** (lines 22-27):
   ```sql
   SELECT DETAILS, SUMMARY, PRIORITY, CREATED_AT
   FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
   WHERE CATEGORY = 'triaged_email'
     AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)
   ORDER BY CREATED_AT DESC
   LIMIT 100
   ```
   → Gets unprocessed triaged emails

2. **Transform data** (lines 99-141):
   - Parse DETAILS JSON
   - Determine category based on classification/priority/tag:
     * HIGH priority → "Urgent/Priority"
     * To: + Needs Response → "To: Need Response/Action"
     * To: + FYI → "To: FYI"
     * CC: + Needs Response → "CC: Need Response/Action"
     * CC: + FYI → "CC: FYI"
   - Build email objects for dashboard

3. **Return response** (lines 143-151):
   ```json
   {
     "success": true,
     "emails": [
       {
         "id": "AAMkAGI1...",
         "outlook_message_id": "AAMkAGI1...",
         "subject": "Q4 Investor Update",
         "from": "John Smith",
         "from_name": "John Smith",
         "from_email": "john@example.com",
         "folder": "02.1 Investor",
         "received_at": "2026-01-26T14:30:00Z",
         "classification": "To:",
         "priority": "HIGH",
         "tag": "Needs Response",
         "category": "Urgent/Priority",
         "summary": "- **Background:** ...",
         "action_items": ["Review Q4 report"],
         "attachments": []
       }
     ],
     "calendar": [...],
     "total_emails": 1,
     "emails_requiring_attention": 1,
     "cached": false
   }
   ```

                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 10: DASHBOARD DISPLAYS EMAILS                                  │
│ File: /dashboards/executive/jstewart.html                          │
└─────────────────────────────────────────────────────────────────────┘

**Display:**
- Left sidebar: Category counts and list
- Center pane: Email details (auto-expands first in category)
- Right sidebar: Today's calendar and stats

**Categories shown:**
- Urgent/Priority
- To: Need Response/Action
- To: FYI
- CC: Need Response/Action
- CC: FYI

---

## 👤 USER ACTIONS & THEIR EFFECTS

### Action: Click "Mark as Read & Close"

**What happens:**

1. **Call mark-read.js** (Dashboard → `/api/email/mark-read`):
   ```javascript
   await fetch('/api/email/mark-read', {
       method: 'POST',
       body: JSON.stringify({
           message_ids: [outlook_message_id],
           user: 'jstewart@middleground.com',
           is_read: true
       })
   });
   ```

2. **mark-read.js calls M365 Gateway** (lines 82-86):
   - Tool: `mark_read` (prefix stripped)
   - Gateway: `https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp`
   - Marks email as read in Microsoft 365

3. **Call mark-processed.js** (Dashboard → `/api/email/mark-processed`):
   ```javascript
   await fetch('/api/email/mark-processed', {
       method: 'POST',
       body: JSON.stringify({
           email_id: email_id
       })
   });
   ```

4. **mark-processed.js updates HIVE_MIND** (lines 62-68):
   ```sql
   UPDATE SOVEREIGN_MIND.HIVE_MIND.ENTRIES
   SET DETAILS = OBJECT_INSERT(DETAILS, 'processed', TRUE, TRUE),
       UPDATED_AT = CURRENT_TIMESTAMP()
   WHERE CATEGORY = 'triaged_email'
     AND DETAILS:email_id::string = '[email_id]'
   ```
   → Sets `processed = true` so email won't appear in dashboard anymore

5. **Dashboard updates** (lines 1912-1918):
   - Removes email from local list
   - Updates category counts in sidebar
   - Auto-advances to next email in category

### Action: Chat with ABBI

**Endpoint:** POST `/api/email/chat-qa`

**Available tools:**
- 6 email tools: read_emails, search_emails, get_email, send_email, reply_email, forward_email
- 3 calendar tools: create_event, update_event, delete_event
- 3 Asana tools: create_task, update_task, create_project

**Example: "Draft a reply to all that says [message]"**

1. Dashboard passes EMAIL CONTEXT with message_id
2. chat-qa.js calls Claude Sonnet 4 with tools
3. Claude executes `reply_email` tool via M365 Gateway
4. Reply sent to all recipients

---

## 🔧 GATEWAY URLS

### M365 Gateway (Email & Calendar)
```
URL: https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp
User: jstewart@middleground.com
Tools: read_emails, mark_read, delete_email, reply_email, send_email,
       create_event, update_event, delete_event, etc.
```

### Snowflake Gateway (Database)
```
URL: https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp
Database: SOVEREIGN_MIND
Tools: sm_query_snowflake, grok_sm_query_snowflake
```

### Claude API (AI)
```
URL: https://api.anthropic.com/v1/messages
Model: claude-sonnet-4-20250514
Key: process.env.ANTHROPIC_API_KEY (Vercel environment variable)
```

---

## 📁 FILE LOCATIONS & PURPOSES

### Dashboard
- `/dashboards/executive/jstewart.html` - Main dashboard UI (v9.9.0)

### Active API Endpoints
- `/api/email/triaged-emails.js` - Fetch emails from HIVE_MIND (called by dashboard)
- `/api/email/auto-triage.js` - Process RAW.EMAILS → HIVE_MIND (called by Make.com)
- `/api/email/triage.js` - Individual email AI triage (called by auto-triage.js)
- `/api/email/mark-read.js` - Mark email as read in M365 (called by dashboard)
- `/api/email/mark-processed.js` - Mark email processed in HIVE_MIND (called by dashboard)
- `/api/email/chat-qa.js` - ABBI chat with 12 tools (called by dashboard)

### Configuration
- `/package.json` - ESM module configuration
- Vercel environment variables:
  * `ANTHROPIC_API_KEY` - Claude API key
  * `WEBHOOK_SECRET` - Optional webhook auth

---

## ⏱️ TIMING & FREQUENCY

### Make.com Upload Scenarios
- **Frequency:** Every 10 minutes
- **Each scenario:** Reads ONE folder, uploads to RAW.EMAILS
- **Total scenarios:** One per folder you want to sync

### Make.com Auto-Triage Scenario
- **Frequency:** Every 5 minutes
- **Calls:** `/api/email/auto-triage`
- **Processes:** Up to 10 emails per run (batch size)
- **Rate limit:** 2 seconds between emails

### Dashboard Refresh
- **Manual:** User clicks refresh button
- **Automatic:** Could add auto-refresh every N minutes if desired

---

## 🚨 CRITICAL DEPENDENCIES

### For the system to work, you MUST have:

1. **RAW.EMAILS table exists** in Snowflake:
   ```sql
   SOVEREIGN_MIND.RAW.EMAILS
   ```

2. **HIVE_MIND.ENTRIES table exists** in Snowflake:
   ```sql
   SOVEREIGN_MIND.HIVE_MIND.ENTRIES
   ```

3. **Make.com scenarios uploading to RAW.EMAILS**:
   - One scenario per folder
   - Running every 10 minutes
   - Successfully inserting to Snowflake

4. **Make.com scenario calling auto-triage**:
   - Calling `/api/email/auto-triage` every 5 minutes
   - No timeout errors

5. **M365 Gateway accessible**:
   - Test: `curl -X POST [gateway_url] -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`

6. **Snowflake Gateway accessible**:
   - Test: Same as above

7. **Vercel environment variables set**:
   - `ANTHROPIC_API_KEY` configured

---

## ❌ YOUR TWO FAILING SCENARIOS

You mentioned these scenarios are failing at the Snowflake insert:
1. "Email (Outlook), Snowflake : 02.1 Investor"
2. "Email (Outlook), Snowflake : 000.1 Signature Request"

**Possible causes:**

### 1. RAW.EMAILS table doesn't exist
Check in Snowflake:
```sql
SHOW TABLES LIKE 'EMAILS' IN SOVEREIGN_MIND.RAW;
```

If it doesn't exist, create it:
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

### 2. Schema mismatch
The Make.com scenario column names don't match the table schema.

Check in Make.com Snowflake module:
- Are all column names spelled exactly as above?
- Are data types correct (VARIANT for JSON fields)?

### 3. Wrong table
The scenarios might be writing to the old table `RAW.EMAIL_BRIEFING_RESULTS` instead.

Check the scenario Snowflake module - the table should be:
- Database: `SOVEREIGN_MIND`
- Schema: `RAW`
- Table: `EMAILS`

### 4. Permissions
The Snowflake connection doesn't have INSERT permission on RAW.EMAILS.

Test in Snowflake:
```sql
INSERT INTO SOVEREIGN_MIND.RAW.EMAILS
  (OUTLOOK_MESSAGE_ID, SUBJECT, SENDER, FOLDER_NAME)
VALUES ('test123', 'Test', 'Test Sender', 'Test Folder');
```

---

## 📊 VERIFICATION QUERIES

### Check if RAW.EMAILS has recent data
```sql
SELECT COUNT(*) as total_emails,
       MAX(RECEIVED_AT) as latest_email
FROM SOVEREIGN_MIND.RAW.EMAILS;
```

### Check if HIVE_MIND has triaged emails
```sql
SELECT COUNT(*) as triaged_count,
       MAX(CREATED_AT) as latest_triage
FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
WHERE CATEGORY = 'triaged_email';
```

### Check unprocessed emails (what dashboard shows)
```sql
SELECT COUNT(*) as unprocessed_count
FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
WHERE CATEGORY = 'triaged_email'
  AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE);
```

### See what folders are in RAW.EMAILS
```sql
SELECT FOLDER_NAME, COUNT(*) as email_count
FROM SOVEREIGN_MIND.RAW.EMAILS
GROUP BY FOLDER_NAME
ORDER BY email_count DESC;
```

### Check for emails from failing folders
```sql
SELECT COUNT(*) as count,
       MAX(CREATED_AT) as latest
FROM SOVEREIGN_MIND.RAW.EMAILS
WHERE FOLDER_NAME IN ('02.1 Investor', '000.1 Signature Request');
```

---

## 🔍 DEBUGGING CHECKLIST

If emails aren't appearing in dashboard:

- [ ] RAW.EMAILS table exists and has data
- [ ] HIVE_MIND.ENTRIES table exists and has data
- [ ] Make.com upload scenarios run without errors
- [ ] Make.com auto-triage scenario runs without errors
- [ ] Check Make.com execution history for errors
- [ ] Check Vercel function logs: `vercel logs --follow`
- [ ] Test M365 gateway accessibility
- [ ] Test Snowflake gateway accessibility
- [ ] Verify ANTHROPIC_API_KEY is set in Vercel
- [ ] Check browser console for errors
- [ ] Try hard refresh (Ctrl+Shift+R)

---

## 📝 SUMMARY

Your data flows through **4 storage locations**:

1. **M365** - Original emails (source of truth)
2. **RAW.EMAILS** - Raw email uploads from Make.com
3. **HIVE_MIND.ENTRIES** - AI-triaged emails
4. **Dashboard local state** - In-browser display

Your system uses **6 API endpoints**:

1. `/api/email/auto-triage` - Process RAW.EMAILS
2. `/api/email/triage` - Individual AI triage
3. `/api/email/triaged-emails` - Fetch for dashboard
4. `/api/email/mark-read` - Mark read in M365
5. `/api/email/mark-processed` - Mark processed in HIVE_MIND
6. `/api/email/chat-qa` - ABBI chat

Your system uses **2 Make.com scenario types**:

1. **Upload scenarios** (multiple) - M365 folders → RAW.EMAILS
2. **Triage scenario** (one) - Calls auto-triage API

**Next step:** Check if RAW.EMAILS table exists and fix your two failing scenarios.
