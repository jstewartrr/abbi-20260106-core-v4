// Sync contacts from reference files to Hive Mind for ABBI to search
const SNOWFLAKE_GATEWAY = 'https://sm-mcp-gateway-east.lemoncoast-87756bcf.eastus.azurecontainerapps.io/mcp';

async function snowflakeCall(query, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(SNOWFLAKE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'sm_query_snowflake', arguments: { sql: query } },
        id: Date.now()
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Snowflake HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const content = data.result?.content?.[0];
    if (content?.type === 'text') {
      const parsed = JSON.parse(content.text);
      if (parsed.success && parsed.data) {
        return parsed.data;
      }
      if (parsed.success) {
        return [];
      }
      throw new Error(parsed.error || 'Unknown Snowflake error');
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function writeToHiveMind(category, summary, details) {
  const escapeSql = (str) => str ? str.replace(/'/g, "''") : '';
  const detailsJson = JSON.stringify(details).replace(/'/g, "''");

  const insertQuery = `
    INSERT INTO SOVEREIGN_MIND.RAW.HIVE_MIND (
      TIMESTAMP, SOURCE, CATEGORY, WORKSTREAM, PRIORITY, SUMMARY, DETAILS
    ) VALUES (
      CURRENT_TIMESTAMP(),
      'ABBI Contact Sync',
      '${escapeSql(category)}',
      'Executive Operations',
      'reference',
      '${escapeSql(summary)}',
      PARSE_JSON('${detailsJson}')
    )
  `;

  return await snowflakeCall(insertQuery);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({
        success: false,
        error: 'Missing contacts array. Expected format: [{ name, email, role, company, reference_name }]'
      });
    }

    console.log(`📇 Syncing ${contacts.length} contacts to Hive Mind...`);

    // Clear old contact entries (keep them fresh monthly)
    console.log('🗑️ Clearing old contact entries...');
    const deleteQuery = `
      DELETE FROM SOVEREIGN_MIND.RAW.HIVE_MIND
      WHERE CATEGORY = 'Contact' AND SOURCE = 'ABBI Contact Sync'
    `;
    await snowflakeCall(deleteQuery);

    // Write each contact to Hive Mind
    let successCount = 0;
    let errorCount = 0;

    for (const contact of contacts) {
      try {
        const summary = `${contact.name} - ${contact.role || 'Contact'} ${contact.company ? `at ${contact.company}` : ''}`.trim();

        const details = {
          name: contact.name,
          email: contact.email,
          role: contact.role || null,
          company: contact.company || null,
          reference_name: contact.reference_name || null, // How John refers to them
          phone: contact.phone || null,
          type: contact.type || 'general', // employee, ceo, cfo, investor, bank, etc.
          notes: contact.notes || null
        };

        await writeToHiveMind('Contact', summary, details);
        successCount++;

        if (successCount % 10 === 0) {
          console.log(`  ✓ Synced ${successCount} contacts...`);
        }
      } catch (contactError) {
        console.error(`  ✗ Failed to sync contact ${contact.name}:`, contactError.message);
        errorCount++;
      }
    }

    console.log(`✅ Contact sync complete: ${successCount} successful, ${errorCount} failed`);

    return res.json({
      success: true,
      synced: successCount,
      failed: errorCount,
      total: contacts.length,
      message: `Successfully synced ${successCount} contacts to Hive Mind`
    });

  } catch (error) {
    console.error('❌ Contact sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync contacts'
    });
  }
}
