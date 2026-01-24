#!/usr/bin/env python3
"""
Background Email Triage Service
Runs on Mac Studio via MCP - no timeout limits
Processes all emails with Claude AI, caches important ones to Snowflake
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Gateways
M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp'
SNOWFLAKE_GATEWAY = 'https://cv-sf-redundant-east-1-20260110.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp'
ANTHROPIC_API_KEY = 'YOUR_KEY_HERE'  # Will be passed as env var

def mcp_call(gateway, tool, args={}):
    """Call MCP tool"""
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool,
            "arguments": args
        },
        "id": int(time.time() * 1000)
    }

    response = requests.post(gateway, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()

    if 'error' in data:
        raise Exception(f"MCP Error: {data['error']}")

    content = data.get('result', {}).get('content', [{}])[0]
    if content.get('type') == 'text':
        return json.loads(content['text'])
    return content

def fetch_emails_from_folders(folders):
    """Fetch emails from specified folders"""
    all_emails = []

    # Get today and yesterday date range
    today = datetime.now()
    yesterday = today - timedelta(days=1)

    for folder in folders:
        print(f"📂 Fetching from: {folder}")
        try:
            result = mcp_call(M365_GATEWAY, 'read_emails', {
                'folder': folder,
                'top': 100,
                'user': 'jstewart@middleground.com'
            })

            if result.get('emails'):
                # Filter to today + yesterday only
                recent = []
                for email in result['emails']:
                    email_date = datetime.fromisoformat(email['date'].replace('Z', '+00:00'))
                    if email_date >= yesterday:
                        recent.append(email)

                print(f"  Found {len(recent)} recent emails")
                all_emails.extend(recent)
        except Exception as e:
            print(f"  ⚠️ Error fetching from {folder}: {e}")

    return all_emails

def triage_emails_with_ai(emails):
    """Use Claude to triage emails in batches"""
    batch_size = 30
    triaged_emails = []

    for i in range(0, len(emails), batch_size):
        batch = emails[i:i+batch_size]
        print(f"\n🤖 AI triaging batch {i//batch_size + 1} ({len(batch)} emails)...")

        # Create summary for AI
        email_summaries = '\n\n'.join([
            f"ID: {email['id']}\n  From: {email['from']}\n  Subject: {email['subject']}\n  Preview: {email.get('preview', '')[:200]}\n  Received: {email['date']}"
            for email in batch
        ])

        prompt = f"""CRITICAL: Categorize ALL {len(batch)} emails below for John Stewart (Managing Partner at Middleground Capital).

{email_summaries}

IMPORTANT: You MUST return exactly {len(batch)} results - one for EACH email above.

For each email, determine:
1. priority: "urgent" (time-sensitive/critical), "high" (important), "medium" (normal), or "fyi" (informational only)
2. is_to_email: true if John is in To: line, false if CC
3. needs_response: true if requires John's action/response, false if just FYI

Categorization rules:
- Portfolio company CEOs/CFOs = high priority
- Investors, placement agents, banks, lenders = high priority
- Legal (Dechert, etc.) = high priority
- Internal team emails TO John = medium priority (unless urgent matter)
- CC emails = usually fyi priority unless specifically asks John to do something
- Automated notifications/receipts/newsletters = fyi priority
- No-reply senders = fyi priority

Return ONLY a JSON array with exactly {len(batch)} objects (no markdown, no explanation):
[
  {{
    "id": "email_id_from_above",
    "priority": "high",
    "is_to_email": true,
    "needs_response": true
  }},
  ...
]"""

        try:
            # Call Claude API
            response = requests.post(
                'https://api.anthropic.com/v1/messages',
                headers={
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                json={
                    'model': 'claude-sonnet-4-20250514',
                    'max_tokens': 4096,
                    'temperature': 0.3,
                    'messages': [{'role': 'user', 'content': prompt}]
                },
                timeout=60
            )

            response.raise_for_status()
            ai_data = response.json()
            ai_text = ai_data['content'][0]['text'].strip()
            ai_text = ai_text.replace('```json', '').replace('```', '').strip()

            results = json.loads(ai_text)

            # Merge AI results with email data
            for result in results:
                email = next((e for e in batch if e['id'] == result['id']), None)
                if email:
                    email.update(result)
                    triaged_emails.append(email)

            print(f"  ✅ Triaged {len(results)} emails")

        except Exception as e:
            print(f"  ❌ AI triage failed: {e}")
            # Skip this batch

    return triaged_emails

def cache_to_snowflake(emails):
    """Cache triaged emails to Snowflake - only urgent/high priority or needs_response"""
    today = datetime.now().strftime('%Y-%m-%d')

    # Filter: only urgent, high priority, or needs response
    important_emails = [
        e for e in emails
        if e.get('priority') in ['urgent', 'high'] or e.get('needs_response')
    ]

    print(f"\n💾 Caching {len(important_emails)} important emails (out of {len(emails)} total)")

    # Delete today's old cache
    try:
        mcp_call(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {
            'sql': f"DELETE FROM SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS WHERE BRIEFING_DATE = '{today}'"
        })
        print("  Cleared old cache")
    except Exception as e:
        print(f"  ⚠️ Cache clear error: {e}")

    # Insert important emails only
    cached_count = 0
    for email in important_emails:
        try:
            sql = f"""
                INSERT INTO SOVEREIGN_MIND.RAW.EMAIL_BRIEFING_RESULTS (
                    EMAIL_ID, SUBJECT, FROM_NAME, FROM_EMAIL, PREVIEW,
                    CATEGORY, PRIORITY, IS_TO_EMAIL, NEEDS_RESPONSE,
                    FOLDER, MAILBOX, RECEIVED_AT, PROCESSED_AT, BRIEFING_DATE
                ) VALUES (
                    '{email['id'].replace("'", "''")}',
                    '{(email.get('subject', '') or '').replace("'", "''")}',
                    '{(email.get('from', '') or '').replace("'", "''")}',
                    '{(email.get('from', '') or '').replace("'", "''")}',
                    '{(email.get('preview', '') or '')[:500].replace("'", "''")}',
                    '{email.get('priority', 'medium')}',
                    '{email.get('priority', 'medium')}',
                    {str(email.get('is_to_email', False)).lower()},
                    {str(email.get('needs_response', False)).lower()},
                    'Inbox',
                    'jstewart@middleground.com',
                    '{email.get('date', datetime.now().isoformat())}',
                    '{datetime.now().isoformat()}',
                    '{today}'
                )
            """

            mcp_call(SNOWFLAKE_GATEWAY, 'sm_query_snowflake', {'sql': sql})
            cached_count += 1

        except Exception as e:
            print(f"  ⚠️ Cache insert error for {email['id']}: {e}")

    print(f"  ✅ Cached {cached_count} emails")
    return cached_count

def main():
    """Main triage process"""
    print("=" * 60)
    print("📧 STARTING EMAIL TRIAGE PROCESS")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    start_time = time.time()

    # Priority folders
    folders = [
        'inbox',
        'Important',
        'Portfolio Companies',
        'Deals',
        'Investors',
        'Internal - Urgent'
    ]

    # Step 1: Fetch emails
    print("\n📥 STEP 1: Fetching emails from all folders")
    all_emails = fetch_emails_from_folders(folders)
    print(f"Total emails fetched: {len(all_emails)}")

    if not all_emails:
        print("No emails to process. Exiting.")
        return

    # Step 2: Triage with AI
    print("\n🤖 STEP 2: AI Triage")
    triaged = triage_emails_with_ai(all_emails)

    # Step 3: Cache to Snowflake
    print("\n💾 STEP 3: Cache to Snowflake")
    cached_count = cache_to_snowflake(triaged)

    # Summary
    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print("✅ EMAIL TRIAGE COMPLETE")
    print(f"⏱️  Duration: {elapsed:.1f} seconds")
    print(f"📊 Fetched: {len(all_emails)} emails")
    print(f"🤖 Triaged: {len(triaged)} emails")
    print(f"💾 Cached: {cached_count} important emails")
    print("=" * 60)

if __name__ == '__main__':
    main()
