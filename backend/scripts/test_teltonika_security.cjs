/**
 * Security test verifying REM-P0-06:
 * - Teltonika TCP Telemetry Device Authentication & Company Binding
 * - Elimination of auto-provisioning
 */

const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const { getOrCreateVehicle, persistGpsRecord } = require('../services/teltonikaListener.cjs');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  database: process.env.POSTGRES_DB || 'erp_db',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

async function runTests() {
  console.log('--- Starting REM-P0-06 Teltonika Security Verification ---');
  const client = await pool.connect();

  try {
    const testCompanyId = crypto.randomUUID();
    const testTenantId = crypto.randomUUID();
    const registeredImei = '860' + Math.floor(100000000000 + Math.random() * 900000000000);
    const unauthenticatedImei = '999' + Math.floor(100000000000 + Math.random() * 900000000000);

    // Setup: Create test company & registered vehicle
    await client.query(
      `INSERT INTO res_companies (id, name, slug, currency) 
       VALUES ($1, $2, $3, 'SAR')`,
      [testCompanyId, `Teltonika Test Co ${testCompanyId.slice(0, 8)}`, `teltonika-test-${testCompanyId.slice(0, 6)}`]
    );

    const vehicleId = crypto.randomUUID();
    await client.query(
      `INSERT INTO vehicles (
        id, company_id, tenant_id, name, license_plate, vin_chassis, 
        vehicle_type, status, current_odometer, is_active, breakdown_risk_score, 
        plate_numbers, traffic_sequence_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        'truck', 'active', 0, true, 0,
        '1234', $6
      )`,
      [
        vehicleId,
        testCompanyId,
        testTenantId,
        'Registered Test Vehicle',
        `KSA-${registeredImei.slice(-4)}`,
        registeredImei
      ]
    );

    // Test 1: Registered vehicle should resolve successfully and be bound to testCompanyId
    console.log('[Test 1] Querying registered vehicle IMEI...');
    const resolvedVehicle = await getOrCreateVehicle(registeredImei);
    if (!resolvedVehicle) {
      throw new Error(`Failed to resolve registered vehicle for IMEI ${registeredImei}`);
    }
    if (resolvedVehicle.id !== vehicleId || resolvedVehicle.company_id !== testCompanyId) {
      throw new Error(`Vehicle resolved with incorrect ID or company_id: ${JSON.stringify(resolvedVehicle)}`);
    }
    console.log('✓ Test 1 Passed: Registered vehicle properly authenticated and company-bound.');

    // Test 2: Unauthenticated / Unregistered IMEI must NOT be auto-provisioned
    console.log('[Test 2] Querying unregistered rogue IMEI...');
    const rogueVehicle = await getOrCreateVehicle(unauthenticatedImei);
    if (rogueVehicle !== null) {
      throw new Error(`Security Breach: Rogue IMEI was auto-provisioned! Result: ${JSON.stringify(rogueVehicle)}`);
    }

    // Verify DB directly: No vehicle with rogue IMEI should exist
    const checkDb = await client.query(
      `SELECT id FROM vehicles WHERE vin_chassis = $1 OR traffic_sequence_number = $1`,
      [unauthenticatedImei]
    );
    if (checkDb.rows.length > 0) {
      throw new Error(`Security Breach: Rogue vehicle was inserted into vehicles table!`);
    }
    console.log('✓ Test 2 Passed: Unregistered IMEI rejected and no auto-provisioning occurred.');

    // Test 3: persistGpsRecord with rogue/unbound vehicle refuses insertion
    console.log('[Test 3] Testing persistGpsRecord refusal on unbound vehicle...');
    const preCountRes = await client.query(`SELECT COUNT(*) FROM gps_events`);
    const countBefore = parseInt(preCountRes.rows[0].count, 10);

    await persistGpsRecord(null, { latitude: 24.7136, longitude: 46.6753, speed: 60, timestamp: Date.now() });
    await persistGpsRecord({ id: null }, { latitude: 24.7136, longitude: 46.6753, speed: 60, timestamp: Date.now() });
    await persistGpsRecord({ id: crypto.randomUUID(), company_id: null }, { latitude: 24.7136, longitude: 46.6753, speed: 60, timestamp: Date.now() });

    const postCountRes = await client.query(`SELECT COUNT(*) FROM gps_events`);
    const countAfter = parseInt(postCountRes.rows[0].count, 10);

    if (countBefore !== countAfter) {
      throw new Error(`Security Breach: GPS event was persisted for invalid/unauthenticated vehicle!`);
    }
    console.log('✓ Test 3 Passed: GPS events refused for unauthenticated or company-unbound vehicle.');

    console.log('=== All REM-P0-06 Teltonika Security Tests Passed! ===');
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
