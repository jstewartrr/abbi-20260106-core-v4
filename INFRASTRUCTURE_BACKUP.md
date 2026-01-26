# Dashboard Infrastructure Backup & Restore

**Last Updated:** 2026-01-26
**Dashboard Version:** v9.9.4

This document contains complete backup of all infrastructure required to run the dashboard.

---

## 📋 TABLE OF CONTENTS

1. [Make.com Scenarios](#makecom-scenarios)
2. [Snowflake Tables](#snowflake-tables)
3. [Vercel Environment Variables](#vercel-environment-variables)
4. [Gateway URLs & Dependencies](#gateway-urls--dependencies)
5. [Folder Configuration](#folder-configuration)
6. [Restore Procedures](#restore-procedures)

---

## 🔧 MAKE.COM SCENARIOS

### Required Scenario: Auto-Triage V2

**Scenario Name:** `[ACTIVE - DASHBOARD] Auto-Triage V2`

**Complete Configuration:**

#### Module 1: Schedule Trigger
```
Type: Schedule
Icon: Clock
Configuration:
  - Interval: Every 5 minutes
  - Starting: [Current date/time]
  - Time zone: America/New_York (EST)
  - Advanced scheduling: OFF
```

#### Module 2: HTTP Request
```
Type: HTTP
Module: Make a request
Configuration:
  - URL: https://abbi-ai.com/api/email/auto-triage-v2
  - Method: POST
  - Headers: (none)
  - Query String: (none)
  - Body type: Raw
  - Content type: JSON (application/json)
  - Request content: {}
  - Parse response: No
  - Timeout: 300 seconds
  - Follow redirect: Yes
  - Use Mutual TLS: No
  - Reject connections: No
  - Share cookies: No
```

#### Scenario Settings
```
Scheduling:
  - Sequential processing: OFF
  - Allow storing incomplete executions: OFF
  - Data is confidential: ON
  - Enable data loss: OFF
  - Auto commit: ON
  - Max number of cycles: 1
  - Max number of results: (default)
```

#### Error Handling
```
Error Handler: None (use default behavior)
Fallback: None
```

---

## 🗄️ SNOWFLAKE TABLES

### Required Table: HIVE_MIND.ENTRIES

**Database:** `SOVEREIGN_MIND`
**Schema:** `HIVE_MIND`
**Table:** `ENTRIES`

**Purpose:** Stores all triaged emails for dashboard display

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.HIVE_MIND.ENTRIES (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    CATEGORY STRING,
    SOURCE STRING,
    SUMMARY STRING,
    DETAILS VARIANT,
    PRIORITY STRING,
    WORKSTREAM STRING,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);
```

**Key Fields for Dashboard:**
- `CATEGORY` = 'triaged_email' (filter for dashboard emails)
- `DETAILS.processed` = FALSE or NULL (filter for unprocessed emails)
- `DETAILS.outlook_message_id` = M365 message ID
- `DETAILS.subject` = Email subject
- `DETAILS.from_name` = Sender name
- `DETAILS.from_email` = Sender email
- `DETAILS.received_at` = When email was received
- `DETAILS.classification` = 'To:' or 'CC:'
- `DETAILS.priority` = 'HIGH' or 'NORMAL'
- `DETAILS.tag` = 'Needs Response' or 'FYI'
- `DETAILS.summary` = AI-generated summary
- `DETAILS.action_items` = Array of action items
- `DETAILS.folder_name` = Outlook folder name

**Indexes:**
```sql
-- Recommended indexes for performance
CREATE INDEX idx_category_processed ON SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CATEGORY, DETAILS:processed);
CREATE INDEX idx_created_at ON SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CREATED_AT DESC);
```

**Sample Query (Dashboard Uses):**
```sql
SELECT DETAILS, SUMMARY, PRIORITY, CREATED_AT
FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
WHERE CATEGORY = 'triaged_email'
  AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE)
ORDER BY CREATED_AT DESC
LIMIT 100;
```

**Mark Email as Processed:**
```sql
UPDATE SOVEREIGN_MIND.HIVE_MIND.ENTRIES
SET DETAILS = OBJECT_INSERT(DETAILS, 'processed', TRUE, TRUE),
    UPDATED_AT = CURRENT_TIMESTAMP()
WHERE DETAILS:outlook_message_id::STRING = '<message_id>';
```

### Legacy Tables (NOT USED - Can be archived)

These tables are NOT used by the current dashboard:
- `SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS` (deprecated)
- `SOVEREIGN_MIND.RAW.EMAILS` (only if using alternative approach)

---

## 🔐 VERCEL ENVIRONMENT VARIABLES

Required environment variables in Vercel project settings:

### Anthropic API Key
```
Name: ANTHROPIC_API_KEY
Value: sk-ant-api03-... (Claude API key)
Environments: Production, Preview, Development
```

### Webhook Secret (Optional)
```
Name: WEBHOOK_SECRET
Value: dev-secret-12345 (or your custom secret)
Environments: Production, Preview, Development
Purpose: Authentication for webhook endpoints (if used)
```

**How to Set in Vercel:**
1. Go to project settings
2. Click "Environment Variables"
3. Add variable name and value
4. Select environments
5. Click "Save"
6. Redeploy for changes to take effect

---

## 🌐 GATEWAY URLS & DEPENDENCIES

### M365 Gateway
```
URL: https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp
Purpose: All M365/Outlook operations (email, calendar)
Used by:
  - /api/email/chat-qa.js (ABBI chat)
  - /api/email/mark-read.js
  - /api/email/auto-triage-v2.js
  - /api/email/triage.js

Available Tools:
  - read_emails, search_emails, get_email
  - send_email, reply_email, forward_email
  - mark_read, delete_email, flag_email
  - create_event, update_event, delete_event
  - list_calendar_events, get_availability
  (Note: Tool names WITHOUT m365_ prefix when calling gateway)
```

### Snowflake Gateway
```
URL: https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp
Purpose: Snowflake database operations
Used by:
  - /api/email/triaged-emails.js (fetch emails)
  - /api/email/triage.js (write to HIVE_MIND)
  - /api/email/mark-processed.js (update processed flag)

Available Tools:
  - sm_query_snowflake
  - grok_sm_query_snowflake
  (Both access SOVEREIGN_MIND database)
```

### Claude API
```
URL: https://api.anthropic.com/v1/messages
Purpose: AI triage and chat functionality
Model: claude-sonnet-4-20250514
Used by:
  - /api/email/triage.js (email triage)
  - /api/email/chat-qa.js (ABBI chat)
```

**Gateway Health Check:**
```bash
# Test M365 Gateway
curl -X POST https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test Snowflake Gateway
curl -X POST https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## 📁 FOLDER CONFIGURATION

### Synced Folders (auto-triage-v2.js lines 103-115)

These folders are actively synced to the dashboard:

```javascript
const foldersToCheck = [
  'Inbox',
  '01.01 John',
  '01.02 Scot',
  '01.03 Tom',
  '01.04 Kathryn',
  '01.05 Will',
  '01.13 MC',
  '01.24 N Transaction Team',
  '01.26 N Operations Team',
  '01.28 Human Capital',
  '02.05 Dechert'
];
```

**File:** `/api/email/auto-triage-v2.js`
**User:** `jstewart@middleground.com`

### Excluded Folders (auto-triage.js lines 122-127)

These folders are automatically skipped if found in RAW.EMAILS:

```javascript
const excludedFolders = [
  'Daily Liquidity',
  'Sent Items',
  'Deleted Items',
  'Drafts',
  'Junk Email',
  '01.31 Office Team'
];
```

**File:** `/api/email/auto-triage.js`

### To Add New Folders

1. Edit `/api/email/auto-triage-v2.js`
2. Add folder name to `foldersToCheck` array (line 103-115)
3. Commit and deploy:
   ```bash
   git add api/email/auto-triage-v2.js
   git commit -m "Add [folder name] to triage"
   git push
   vercel --prod --yes
   ```
4. No Make.com changes needed - automatic!

---

## 🔄 RESTORE PROCEDURES

### Restore Make.com Scenario

If the Auto-Triage V2 scenario is deleted or broken:

1. **Create new scenario** in Make.com
2. **Add Schedule module:**
   - Search for "Schedule"
   - Set interval: Every 5 minutes

3. **Add HTTP Request module:**
   - Search for "HTTP"
   - Select "Make a request"
   - URL: `https://abbi-ai.com/api/email/auto-triage-v2`
   - Method: POST
   - Body: `{}`
   - Timeout: 300

4. **Save and enable**
   - Click Save
   - Toggle ON
   - Click "Run once" to test

5. **Verify:**
   - Check execution history - no errors
   - Check dashboard - emails appear within 10 minutes

### Restore Snowflake Table

If HIVE_MIND.ENTRIES table is corrupted or deleted:

```sql
-- Recreate table
CREATE TABLE IF NOT EXISTS SOVEREIGN_MIND.HIVE_MIND.ENTRIES (
    ID STRING NOT NULL DEFAULT UUID_STRING(),
    CATEGORY STRING,
    SOURCE STRING,
    SUMMARY STRING,
    DETAILS VARIANT,
    PRIORITY STRING,
    WORKSTREAM STRING,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ID)
);

-- Recreate indexes
CREATE INDEX idx_category_processed ON SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CATEGORY, DETAILS:processed);
CREATE INDEX idx_created_at ON SOVEREIGN_MIND.HIVE_MIND.ENTRIES (CREATED_AT DESC);

-- Test query
SELECT COUNT(*) FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES WHERE CATEGORY = 'triaged_email';
```

### Restore Vercel Environment Variables

1. Go to Vercel project: https://vercel.com/abbi-ai/cv-abbi-ai-com-20260107
2. Settings → Environment Variables
3. Add `ANTHROPIC_API_KEY` with your Claude API key
4. Add `WEBHOOK_SECRET` (optional)
5. Redeploy: `vercel --prod --yes`

### Restore Code from Git

If code is lost or corrupted:

```bash
# Clone fresh copy
git clone https://github.com/jstewartrr/abbi-20260106-core-v4.git
cd abbi-20260106-core-v4

# Verify active files exist
ls -la api/email/*.js
ls -la dashboards/executive/jstewart.html

# Deploy
vercel --prod --yes
```

### Full System Test After Restore

1. **Test Make.com scenario:**
   - Go to scenario → Click "Run once"
   - Check execution history - should succeed
   - No errors

2. **Test Snowflake table:**
   ```sql
   SELECT COUNT(*) as email_count
   FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES
   WHERE CATEGORY = 'triaged_email'
     AND (DETAILS:processed IS NULL OR DETAILS:processed = FALSE);
   ```
   - Should return emails (if any unprocessed)

3. **Test Dashboard:**
   - Go to https://abbi-ai.com
   - Should load emails within 10 seconds
   - Click an email - should expand
   - Click "Mark as Read & Close" - should advance to next

4. **Test ABBI Chat:**
   - Open an email
   - Type "Hello ABBI"
   - Should respond within 5 seconds
   - Try "draft a reply to all that says test"
   - Should attempt to execute (even if you cancel)

---

## 🔒 BACKUP SCHEDULE

**Recommended:**
- **Monthly:** Export Make.com scenario configuration (screenshot or JSON)
- **Monthly:** Backup Snowflake HIVE_MIND table
  ```sql
  CREATE TABLE SOVEREIGN_MIND.HIVE_MIND.ENTRIES_BACKUP_20260126 AS
  SELECT * FROM SOVEREIGN_MIND.HIVE_MIND.ENTRIES;
  ```
- **On every change:** Commit code to Git
- **After Vercel deploys:** Note deployment URL and timestamp

**Backup Storage:**
- Git repository: https://github.com/jstewartrr/abbi-20260106-core-v4
- Documentation: This file (INFRASTRUCTURE_BACKUP.md)
- Make.com screenshots: Store in `infrastructure_backups/` folder

---

## 📞 EMERGENCY CONTACTS

**If everything breaks:**

1. Check this documentation first
2. Check MAKE_COM_CORRECT_SETUP.md for scenario setup
3. Check MAKE_COM_DELETION_CHECKLIST.md for cleanup
4. Check api/email/README.md for file reference
5. Check Vercel deployment logs: `vercel logs`
6. Check Make.com execution history

**System Status Check:**
```bash
# Test dashboard
curl https://abbi-ai.com/api/email/triaged-emails

# Test auto-triage
curl -X POST https://abbi-ai.com/api/email/auto-triage-v2

# Test gateways
curl -X POST https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## ✅ INFRASTRUCTURE CHECKLIST

Use this to verify all systems are operational:

- [ ] Make.com scenario exists and is enabled
- [ ] Make.com scenario runs every 5 minutes without errors
- [ ] Snowflake HIVE_MIND.ENTRIES table exists and has data
- [ ] Vercel environment variables are set (ANTHROPIC_API_KEY)
- [ ] M365 gateway is accessible (returns tool list)
- [ ] Snowflake gateway is accessible (returns tool list)
- [ ] Dashboard loads at https://abbi-ai.com
- [ ] Dashboard shows triaged emails
- [ ] Mark as Read functionality works
- [ ] ABBI chat responds
- [ ] Auto-advance to next email works
- [ ] Category counts update in real-time

**Last Verified:** _________________ (fill in date)
**Verified By:** _________________ (fill in name)
