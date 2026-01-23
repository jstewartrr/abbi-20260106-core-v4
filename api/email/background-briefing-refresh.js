// Background Daily Briefing Refresh - Auto-runs every 3 hours to keep cache fresh
// This ensures instant load when user opens dashboard
const M365_GATEWAY = 'https://m365-mcp-west.nicecliff-a1c1a3b6.westus2.azurecontainerapps.io/mcp';
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

// Import the same processing logic from daily-briefing.js
// We'll call the daily-briefing endpoint with force=true to trigger fresh processing

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

    console.log('🔄 Background briefing refresh triggered...');
    const startTime = Date.now();

    // Call the daily briefing endpoint with force=true to trigger fresh processing
    const briefingUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/email/daily-briefing?force=true`;

    console.log(`📞 Calling daily briefing API: ${briefingUrl}`);

    const response = await fetch(briefingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: 'jstewart@middleground.com'
      })
    });

    if (!response.ok) {
      throw new Error(`Daily briefing API returned ${response.status}`);
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
