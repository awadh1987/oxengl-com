import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cron = require('node-cron');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'erp_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function sendAlert(recipient, subject, message) {
  console.log(`[COMPLIANCE ALERT] To: ${recipient} | ${subject} -> ${message}`);
}

async function runComplianceAudit() {
  console.log('Running daily KSA fleet compliance check...');
  const client = await pool.connect();
  try {
    const vehicleQuery = `
      SELECT id, plate_numbers, naql_card_expiry_date, istimara_expiry_date 
      FROM vehicles 
      WHERE naql_card_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         OR istimara_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
    `;
    const vehicles = await client.query(vehicleQuery);
    console.log(`[COMPLIANCE CHECK] Checked vehicles. Found ${vehicles.rows.length} risk flags.`);
    for (const v of vehicles.rows) {
      await sendAlert('fleet-manager@oxengl.com', `Vehicle Risk: ${v.plate_numbers || v.id}`, 'Impending Card/Istimara Expiry');
    }

    const driverQuery = `
      SELECT id, first_name, last_name, iqama_expiry_date, professional_card_expiry_date 
      FROM drivers 
      WHERE iqama_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         OR professional_card_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
    `;
    const drivers = await client.query(driverQuery);
    console.log(`[COMPLIANCE CHECK] Checked drivers. Found ${drivers.rows.length} risk flags.`);
    for (const d of drivers.rows) {
      const driverName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || `Driver ID ${d.id}`;
      await sendAlert('hr@oxengl.com', `Driver Risk: ${driverName}`, 'Impending Iqama/Card Expiry');
    }
    return { vehiclesFlagged: vehicles.rows.length, driversFlagged: drivers.rows.length };
  } catch (err) {
    console.error('Error in compliance cron:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Scheduled daily at 08:00 AM
cron.schedule('0 8 * * *', async () => {
  try {
    await runComplianceAudit();
  } catch (e) {
    console.error('[CRON FAILURE]', e);
  }
});

// Allow manual test trigger when run directly via node services/complianceCron.js --trigger
if (process.argv.includes('--trigger')) {
  (async () => {
    try {
      console.log('--- Manual Test Trigger Initiated ---');
      const result = await runComplianceAudit();
      console.log('--- Manual Test Trigger Completed Successfully ---', result);
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error('--- Manual Test Trigger Failed ---', err);
      await pool.end();
      process.exit(1);
    }
  })();
}

export { runComplianceAudit, pool };
export default { runComplianceAudit, pool };
