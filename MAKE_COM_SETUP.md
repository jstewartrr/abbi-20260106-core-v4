# Make.com Email Triage Setup Guide

This guide explains how to set up Make.com scenarios to automatically triage emails for the PM Dashboard.

## Overview

Make.com will trigger email triage on a schedule (e.g., every hour) by calling the triage webhook endpoint. The webhook:
1. Fetches recent emails from M365 (today + yesterday)
2. Uses Claude AI to categorize and prioritize each email
3. Filters out spam and low-priority automated emails
4. Caches important emails to Snowflake HIVE_MIND
5. Dashboard loads instantly from this cache

---

## Step 1: Create Make.com Scenario

### Basic Setup
1. Go to [Make.com](https://www.make.com/en/login)
2. Click **Create a new scenario**
3. Name it: "PM Dashboard - Email Triage"

### Add Schedule Trigger
1. Click the **+** button to add a module
2. Search for "**Schedule**" and select "**Schedule**"
3. Choose "**Every hour**" (or your preferred frequency)
4. Set the schedule:
   - **Interval**: 1
   - **Unit**: Hours
   - **Start time**: 6:00 AM (first run of the day)
   - **End time**: 10:00 PM (last run of the day)
   - **Days**: Monday - Friday (business days only)

### Add HTTP Request Module
1. Click the **+** after the Schedule module
2. Search for "**HTTP**" and select "**Make a request**"
3. Configure the request:

   **URL**:
   ```
   https://abbi-ai.com/api/email/triage-webhook
   ```

   **Method**: `POST`

   **Headers**:
   - **Content-Type**: `application/json`
   - **Authorization**: `Bearer YOUR_WEBHOOK_SECRET`
     (Get the secret from Vercel environment variables - see Step 2)

   **Body**: Leave empty (or add `{}`)

4. Click **OK**

### Add Error Handler (Optional)
1. Right-click the HTTP module
2. Select "Add error handler"
3. Add a "Gmail" or "Email" module to send you alerts if triage fails

---

## Step 2: Set Environment Variables in Vercel

The webhook requires a secret key for authentication.

### Option A: Use Existing Secret
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: **abbi-ai-site** (or cv-abbi-ai-com-20260107)
3. Go to **Settings** → **Environment Variables**
4. Check if `WEBHOOK_SECRET` exists
5. If yes, copy its value and use it in Make.com (Step 1)

### Option B: Create New Secret
1. Go to Vercel project → **Settings** → **Environment Variables**
2. Click **Add**
3. Name: `WEBHOOK_SECRET`
4. Value: Generate a strong secret (e.g., `make-triage-secret-2026-xyz123`)
5. Environment: Select **Production**, **Preview**, and **Development**
6. Click **Save**
7. **Redeploy** your Vercel project to apply the new variable
8. Use this secret in Make.com (Step 1)

---

## Step 3: Test the Scenario

### Manual Test
1. In Make.com, click **Run once** at the bottom
2. Watch the execution - it should:
   - Trigger the schedule
   - Call the webhook
   - Return a success response with email counts

### Check the Response
The webhook should return JSON like:
```json
{
  "success": true,
  "message": "Email triage completed successfully",
  "total_emails_fetched": 45,
  "emails_triaged": 45,
  "emails_cached": 12,
  "processing_time": "23.4s",
  "briefing_date": "2026-01-24"
}
```

### Verify in Dashboard
1. Open the PM Dashboard: https://abbi-ai.com/dashboards/executive/jstewart
2. Emails should now appear instantly (no loading delay)
3. Check that spam/automated emails are filtered out
4. Only urgent, high-priority, or actionable emails should appear

---

## Step 4: Activate the Scenario

1. In Make.com, toggle the scenario to **ON**
2. Click **Save** (or Schedule if prompted)
3. The scenario will now run automatically on your schedule

---

## Alternative: Use Vercel Cron (No Make.com Required)

If you prefer not to use Make.com, the system already has a Vercel cron job configured:

- **Endpoint**: `/api/email/background-briefing-refresh`
- **Schedule**: Runs at 6 AM, 10 AM, 2 PM, and 6 PM daily
- **Status**: ✅ Active (configured in `vercel.json`)

This cron job calls the same triage webhook internally. **No additional setup needed.**

---

## Troubleshooting

### "Unauthorized" Error (401)
- Check that the `Authorization` header is set correctly in Make.com
- Verify the `WEBHOOK_SECRET` matches in both Make.com and Vercel
- Ensure the secret is deployed (redeploy Vercel after adding variables)

### "Triage failed" Error (500)
- Check Vercel logs: Go to Vercel Dashboard → Your Project → Logs
- Look for error messages in the `/api/email/triage-webhook` logs
- Common issues:
  - M365 gateway timeout
  - Claude API key missing or invalid
  - Snowflake connection error

### Dashboard Still Empty
1. Check if cache has data:
   - Go to Snowflake
   - Run: `SELECT COUNT(*) FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE = CURRENT_DATE()`
   - Should return > 0

2. Check if dashboard is reading cache:
   - Open browser dev tools → Network tab
   - Refresh dashboard
   - Check `/api/email/daily-briefing` response
   - Should show `"cached": true` and list emails

3. Force refresh:
   - Add `?force=true` to the URL: https://abbi-ai.com/dashboards/executive/jstewart?force=true
   - This bypasses cache and processes emails live (slower)

---

## Email Filtering Rules

The triage system filters emails based on these rules:

### ✅ Cached (Will Appear in Dashboard)
- Priority: **urgent** or **high**
- OR `needs_response: true`
- AND Category NOT in: `email-spam`, `email-automated`

### ❌ Filtered Out (Won't Appear)
- Category: `email-spam`
- Category: `email-automated` (newsletters, receipts, notifications)
- Priority: `fyi` (unless `needs_response: true`)
- No-reply senders
- Automated notifications

### Categories
The AI assigns one of these categories:
- `email-urgent` - Time-sensitive, critical
- `email-investor` - Investors, placement agents, banks
- `email-portfolio-ceo-cfo` - Portfolio company CEOs/CFOs
- `email-portfolio-general` - Portfolio companies (other contacts)
- `email-deals` - Deal flow, legal, M&A
- `email-internal-important` - Internal team (TO: John)
- `email-internal-general` - Internal team (CC: John)
- `email-external` - External contacts
- `email-automated` - Newsletters, receipts, notifications
- `email-spam` - Junk, spam

---

## Monitoring

### Make.com Monitoring
- Make.com Dashboard shows:
  - Execution history
  - Success/failure rates
  - Error logs

### Vercel Monitoring
- Vercel Dashboard → Logs shows:
  - Triage webhook calls
  - Email counts
  - Processing times
  - Errors

### Dashboard Version
Check the dashboard footer for version number to ensure latest code is deployed.

---

## Support

If you encounter issues:
1. Check Vercel logs for detailed error messages
2. Verify all environment variables are set
3. Test the webhook manually with curl:

```bash
curl -X POST https://abbi-ai.com/api/email/triage-webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"
```

Expected response: Success with email counts
