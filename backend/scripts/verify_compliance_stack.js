import net from 'net';
import pg from 'pg';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { execSync } from 'child_process';
import 'dotenv/config';

const { Pool } = pg;

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
});

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'erp_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

const results = [];

function recordResult(subsystem, testName, status, details) {
  results.push({ subsystem, testName, status, details });
  const icon = status === 'PASSED' ? '✅' : '❌';
  console.log(`${icon} [${subsystem}] ${testName}: ${details}`);
}

async function runSuite() {
  console.log('\n====================================================================');
  console.log('🛡️  OXENGL KSA FLEET COMPLIANCE INTEGRATION TEST SUITE');
  console.log('====================================================================\n');

  // TEST 1: Redis Connectivity
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      recordResult('Infrastructure', 'Redis Core Cache', 'PASSED', 'Responded with PONG on 127.0.0.1:6379');
    } else {
      recordResult('Infrastructure', 'Redis Core Cache', 'FAILED', `Unexpected ping reply: ${pong}`);
    }
  } catch (err) {
    recordResult('Infrastructure', 'Redis Core Cache', 'FAILED', err.message);
  }

  // TEST 2: PM2 Managed Process State
  try {
    const pm2Output = execSync('pm2 jlist', { encoding: 'utf-8' });
    const apps = JSON.parse(pm2Output);
    const expected = ['oxengl-api', 'oxengl-compliance-cron', 'oxengl-tcp-listener', 'oxengl-wasl-worker'];
    
    let allOnline = true;
    for (const name of expected) {
      const app = apps.find((a) => a.name === name);
      if (app && app.pm2_env.status === 'online') {
        recordResult('Orchestration', `PM2: ${name}`, 'PASSED', `Active & Online (PID ${app.pid}, Mem: ${(app.monit.memory / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        recordResult('Orchestration', `PM2: ${name}`, 'FAILED', `Status: ${app ? app.pm2_env.status : 'NOT FOUND'}`);
        allOnline = false;
      }
    }
  } catch (err) {
    recordResult('Orchestration', 'PM2 Process Discovery', 'FAILED', err.message);
  }

  // TEST 3: Nginx L4 Stream & Teltonika GPS Ingestion (Port 15000 -> 13000)
  const testImei = '860999888777666';
  await new Promise((resolve) => {
    const client = new net.Socket();
    let step = 'HANDSHAKE';

    const timeout = setTimeout(() => {
      recordResult('Telemetry', 'Teltonika Ingestion (Port 15000)', 'FAILED', 'Connection timed out after 5s');
      client.destroy();
      resolve();
    }, 5000);

    client.connect(15000, '127.0.0.1', () => {
      // Send 15-byte IMEI
      const imeiPayload = Buffer.alloc(17);
      imeiPayload.writeUInt16BE(15, 0);
      imeiPayload.write(testImei, 2, 'ascii');
      client.write(imeiPayload);
    });

    client.on('data', (data) => {
      if (step === 'HANDSHAKE') {
        if (data.length >= 1 && data[0] === 0x01) {
          step = 'AVL';
          // Send 1 record Codec 8 packet
          const now = BigInt(Date.now());
          const lon = Math.round(46.7123 * 10000000);
          const lat = Math.round(24.7891 * 10000000);
          const recBuf = Buffer.alloc(8 + 1 + 4 + 4 + 2 + 2 + 1 + 2 + 6); // 30 bytes
          recBuf.writeBigUInt64BE(now, 0);
          recBuf.writeUInt8(1, 8); // Priority
          recBuf.writeInt32BE(lon, 9);
          recBuf.writeInt32BE(lat, 13);
          recBuf.writeInt16BE(580, 17); // Alt
          recBuf.writeUInt16BE(180, 19); // Angle
          recBuf.writeUInt8(14, 21); // Satellites
          recBuf.writeUInt16BE(92, 22); // Speed (92 km/h)
          recBuf.fill(0, 24, 30); // 6 IO bytes

          const avlLen = 1 + 1 + recBuf.length + 1; // 2 + recBuf.length + 1
          const packet = Buffer.alloc(4 + 4 + avlLen + 4);
          packet.writeUInt32BE(0, 0);
          packet.writeUInt32BE(avlLen, 4);
          packet.writeUInt8(0x08, 8);
          packet.writeUInt8(1, 9);
          recBuf.copy(packet, 10);
          packet.writeUInt8(1, 10 + recBuf.length);
          packet.writeUInt32BE(0x12345678, 10 + recBuf.length + 1);

          client.write(packet);
        } else {
          recordResult('Telemetry', 'Teltonika Ingestion (Port 15000)', 'FAILED', 'Invalid handshake response');
          clearTimeout(timeout);
          client.destroy();
          resolve();
        }
      } else if (step === 'AVL') {
        clearTimeout(timeout);
        if (data.length >= 4 && data.readUInt32BE(0) === 1) {
          recordResult('Telemetry', 'Teltonika Ingestion (Port 15000)', 'PASSED', 'Handshake 0x01 + Codec 8 Packet ACK confirmed');
        } else {
          recordResult('Telemetry', 'Teltonika Ingestion (Port 15000)', 'FAILED', `Unexpected ACK buffer: ${data.toString('hex')}`);
        }
        client.end();
        resolve();
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      recordResult('Telemetry', 'Teltonika Ingestion (Port 15000)', 'FAILED', err.message);
      resolve();
    });
  });

  // TEST 4: PostgreSQL Database Persistence Check
  try {
    // Allow 500ms for async persist
    await new Promise((r) => setTimeout(r, 500));
    const dbRes = await pool.query(
      `SELECT g.id, g.latitude, g.longitude, g.speed_kph, v.vin_chassis 
       FROM gps_events g
       JOIN vehicles v ON v.id = g.vehicle_id
       WHERE v.vin_chassis = $1 
       ORDER BY g.timestamp DESC LIMIT 1`,
      [testImei]
    );

    if (dbRes.rows.length > 0) {
      const row = dbRes.rows[0];
      recordResult('Database', 'GPS Event Persistence', 'PASSED', `Row ID: ${row.id} | Coordinates: (${row.latitude}, ${row.longitude}) | Speed: ${row.speed_kph} km/h`);
    } else {
      recordResult('Database', 'GPS Event Persistence', 'FAILED', 'No row found in gps_events matching test IMEI');
    }
  } catch (err) {
    recordResult('Database', 'GPS Event Persistence', 'FAILED', err.message);
  }

  // TEST 5: BullMQ Job Dispatch & WASL Worker
  try {
    const queue = new Queue('wasl-compliance-queue', {
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });

    const job = await queue.add('DISPATCH_TELEMETRY', {
      type: 'DISPATCH_TELEMETRY',
      payload: {
        sequenceNumber: '1092837465',
        latitude: 24.7891,
        longitude: 46.7123,
        speed: 92.0,
        heading: 180,
      },
    });

    // Wait for completion (poll job state up to 4s)
    let completed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const state = await job.getState();
      if (state === 'completed') {
        completed = true;
        recordResult('Regulatory', 'BullMQ WASL Dispatcher', 'PASSED', `Job ${job.id} dispatched & processed successfully by Worker`);
        break;
      }
    }

    if (!completed) {
      const state = await job.getState();
      recordResult('Regulatory', 'BullMQ WASL Dispatcher', 'FAILED', `Job ${job.id} remained in state: ${state}`);
    }

    await queue.close();
  } catch (err) {
    recordResult('Regulatory', 'BullMQ WASL Dispatcher', 'FAILED', err.message);
  }

  // TEST 6: Compliance Cron Check Manual Run
  try {
    const cronOutput = execSync('node services/complianceCron.js --trigger', { encoding: 'utf-8' });
    if (cronOutput.includes('Completed Successfully')) {
      recordResult('Compliance', 'Daily Expiry Cron Engine', 'PASSED', 'Successfully audited vehicles and drivers with 0 runtime errors');
    } else {
      recordResult('Compliance', 'Daily Expiry Cron Engine', 'FAILED', cronOutput);
    }
  } catch (err) {
    recordResult('Compliance', 'Daily Expiry Cron Engine', 'FAILED', err.message);
  }

  console.log('\n====================================================================');
  console.log('📊 INTEGRATION TEST SUITE SUMMARY:');
  console.log('====================================================================');
  console.table(results);

  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  if (failedCount === 0) {
    console.log('\n🎉 ALL 6 COMPLIANCE & TELEMETRY SUBSYSTEMS OPERATING AT 100% HEALTH!\n');
    await redis.quit();
    await pool.end();
    process.exit(0);
  } else {
    console.error(`\n❌ ${failedCount} tests failed!\n`);
    await redis.quit();
    await pool.end();
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
