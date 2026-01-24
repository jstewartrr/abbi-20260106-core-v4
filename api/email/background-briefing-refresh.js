// Background Daily Briefing Refresh - Auto-runs every 3 hours to keep cache fresh
// Calls local triage webhook which processes emails with AI and caches to Snowflake

const TRIAGE_WEBHOOK_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/email/triage-webhook`
  : 'http://localhost:3000/api/email/triage-webhook';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Verify this is a cron job or authenticated request
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';

    if (req.headers['x-vercel-cron'] !== '1' && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - this endpoint is for cron jobs only'
      });
    }

    console.log('🔄 Background briefing refresh triggered - calling triage webhook...');
    const startTime = Date.now();

    const webhookSecret = process.env.WEBHOOK_SECRET || 'dev-secret-12345';

    // Call the triage webhook (internal endpoint, 5 min timeout)
    const response = await fetch(TRIAGE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookSecret}`
      }
    });

    if (!response.ok) {
      throw new Error(`Triage service returned ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Background refresh complete in ${elapsed}s`);
    console.log(`   Fetched ${data.total_emails_fetched} emails`);
    console.log(`   Triaged ${data.emails_triaged} emails`);
    console.log(`   Cached ${data.emails_cached} important emails`);

    return res.json({
      success: true,
      message: 'Background briefing refresh completed',
      processing_time: `${elapsed}s`,
      emails_fetched: data.total_emails_fetched,
      emails_triaged: data.emails_triaged,
      emails_cached: data.emails_cached,
      briefing_date: data.briefing_date,
      next_refresh: 'In 3 hours'
    });

  } catch (error) {
    console.error('❌ Background refresh error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Background refresh failed'
    });
  }
}
