// Background Daily Briefing Refresh - Auto-runs every 3 hours to keep cache fresh
// Calls Azure triage service which processes emails with AI and caches to Snowflake

const TRIAGE_SERVICE_URL = 'https://cv-executive-dashboard-triage.lemoncoast-87756bcf.eastus.azurecontainerapps.io/triage';

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

    console.log('🔄 Background briefing refresh triggered - calling Azure triage service...');
    const startTime = Date.now();

    // Call the Azure Container App triage service (no timeout limits)
    const response = await fetch(TRIAGE_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Triage service returned ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Background refresh complete in ${elapsed}s`);
    console.log(`   Processed ${data.total_emails_reviewed} emails`);
    console.log(`   ${data.emails_requiring_attention} requiring attention`);

    return res.json({
      success: true,
      message: 'Background briefing refresh completed',
      processing_time: `${elapsed}s`,
      emails_processed: data.total_emails_reviewed,
      emails_cached: data.emails_requiring_attention,
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
