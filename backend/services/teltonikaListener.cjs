const net = require('net');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const PORT = parseInt(process.env.TCP_INGESTION_PORT || '13000', 10);
const HOST = process.env.TCP_INGESTION_HOST || '0.0.0.0';

const pool = new Pool({
  user: process.env.POSTGRES_USER || (process.env.DB_USER && !process.env.DB_USER.includes('mock') ? process.env.DB_USER : 'postgres'),
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  database: process.env.POSTGRES_DB || (process.env.DB_NAME && !process.env.DB_NAME.includes('mock') ? process.env.DB_NAME : 'erp_db'),
  password: process.env.POSTGRES_PASSWORD || (process.env.DB_PASSWORD && !process.env.DB_PASSWORD.includes('mock') ? process.env.DB_PASSWORD : 'postgres'),
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432', 10),
});

const vehicleCache = new Map();

async function getOrCreateVehicle(imei) {
  if (vehicleCache.has(imei)) {
    return vehicleCache.get(imei);
  }

  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, company_id, tenant_id, name, license_plate FROM vehicles 
       WHERE (vin_chassis = $1 OR license_plate = $1 OR plate_numbers = $1 OR traffic_sequence_number = $1 OR name = $1)
         AND is_active = true
       LIMIT 1`,
      [imei]
    );

    if (res.rows.length > 0) {
      const v = res.rows[0];
      v.tenant_id = v.tenant_id || v.company_id;
      vehicleCache.set(imei, v);
      return v;
    }

    // Security hardening: Reject unauthenticated/unregistered device IMEI. Do NOT auto-provision.
    console.warn(`[SECURITY WARNING] [TELTONIKA] Unregistered device IMEI rejected: ${imei}. Discarding telemetry packet.`);
    return null;
  } catch (err) {
    console.error(`[TELTONIKA] Error in vehicle lookup for ${imei}:`, err.message);
    return null;
  } finally {
    client.release();
  }
}

async function persistGpsRecord(vehicle, record) {
  if (!vehicle || !vehicle.id || !vehicle.company_id) {
    console.warn(`[SECURITY WARNING] [TELTONIKA] Refusing GPS insertion: vehicle not bound to registered company.`);
    return;
  }
  try {
    await pool.query(
      `INSERT INTO gps_events (
        id, tenant_id, vehicle_id, latitude, longitude, speed_kph, "timestamp"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        vehicle.tenant_id || vehicle.company_id,
        vehicle.id,
        record.latitude.toFixed(6),
        record.longitude.toFixed(6),
        record.speed.toFixed(2),
        new Date(record.timestamp)
      ]
    );
  } catch (err) {
    console.error(`[TELTONIKA] Error saving GPS event:`, err.message);
  }
}

function parseAvlPacket(buffer, offset = 0) {
  let cur = offset;
  if (buffer.length < cur + 10) return null;

  if (buffer.readUInt32BE(cur) === 0) {
    cur += 4;
  }

  const dataLength = buffer.readUInt32BE(cur);
  cur += 4;

  if (buffer.length < cur + dataLength) {
    return null;
  }

  const codecId = buffer.readUInt8(cur);
  cur += 1;

  const recordsCount = buffer.readUInt8(cur);
  cur += 1;

  const records = [];

  for (let i = 0; i < recordsCount; i++) {
    if (codecId === 0x08) {
      const timestampMs = Number(buffer.readBigUInt64BE(cur));
      cur += 8;

      const priority = buffer.readUInt8(cur);
      cur += 1;

      const longitude = buffer.readInt32BE(cur) / 10000000.0;
      cur += 4;

      const latitude = buffer.readInt32BE(cur) / 10000000.0;
      cur += 4;

      const altitude = buffer.readInt16BE(cur);
      cur += 2;

      const angle = buffer.readUInt16BE(cur);
      cur += 2;

      const satellites = buffer.readUInt8(cur);
      cur += 1;

      const speed = buffer.readUInt16BE(cur);
      cur += 2;

      // Skip IO elements safely with bounds check
      if (cur < buffer.length) {
        const eventIoId = buffer.readUInt8(cur); cur += 1;
      }
      if (cur < buffer.length) {
        const totalIo = buffer.readUInt8(cur); cur += 1;
      }
      if (cur < buffer.length) {
        const n1 = buffer.readUInt8(cur); cur += 1 + n1 * 2;
      }
      if (cur < buffer.length) {
        const n2 = buffer.readUInt8(cur); cur += 1 + n2 * 3;
      }
      if (cur < buffer.length) {
        const n4 = buffer.readUInt8(cur); cur += 1 + n4 * 5;
      }
      if (cur < buffer.length) {
        const n8 = buffer.readUInt8(cur); cur += 1 + n8 * 9;
      }

      records.push({
        timestamp: timestampMs,
        priority,
        longitude,
        latitude,
        altitude,
        angle,
        satellites,
        speed
      });
    } else if (codecId === 0x8E) {
      const timestampMs = Number(buffer.readBigUInt64BE(cur));
      cur += 8;

      const priority = buffer.readUInt8(cur);
      cur += 1;

      const longitude = buffer.readInt32BE(cur) / 10000000.0;
      cur += 4;

      const latitude = buffer.readInt32BE(cur) / 10000000.0;
      cur += 4;

      const altitude = buffer.readInt16BE(cur);
      cur += 2;

      const angle = buffer.readUInt16BE(cur);
      cur += 2;

      const satellites = buffer.readUInt8(cur);
      cur += 1;

      const speed = buffer.readUInt16BE(cur);
      cur += 2;

      cur += 2;
      cur += 2;
      const n1 = buffer.readUInt16BE(cur);
      cur += 2 + n1 * 3;
      const n2 = buffer.readUInt16BE(cur);
      cur += 2 + n2 * 4;
      const n4 = buffer.readUInt16BE(cur);
      cur += 2 + n4 * 6;
      const n8 = buffer.readUInt16BE(cur);
      cur += 2 + n8 * 10;
      if (cur + 2 <= buffer.length) {
        const nx = buffer.readUInt16BE(cur);
        cur += 2;
        for (let j = 0; j < nx; j++) {
          cur += 2;
          const valLen = buffer.readUInt16BE(cur);
          cur += 2 + valLen;
        }
      }

      records.push({
        timestamp: timestampMs,
        priority,
        longitude,
        latitude,
        altitude,
        angle,
        satellites,
        speed
      });
    } else {
      console.warn(`[TELTONIKA] Unsupported Codec ID: 0x${codecId.toString(16)}`);
      break;
    }
  }

  if (cur < buffer.length) {
    const numberData2 = buffer.readUInt8(cur);
    cur += 1;
  }

  if (cur + 4 <= buffer.length) {
    cur += 4;
  }

  return {
    recordsCount,
    records,
    bytesConsumed: cur - offset
  };
}

const server = net.createServer((socket) => {
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[TELTONIKA] New client connected from ${clientAddr}`);

  let state = 'WAITING_IMEI';
  let imei = null;
  let vehiclePromise = null;
  let buffer = Buffer.alloc(0);

  socket.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    try {
      if (state === 'WAITING_IMEI') {
        let parsedImei = null;
        let consumed = 0;

        if (buffer.length >= 17 && buffer.readUInt16BE(0) === 15) {
          parsedImei = buffer.subarray(2, 17).toString('ascii').trim();
          consumed = 17;
        } else if (buffer.length >= 15) {
          const candidate = buffer.subarray(0, 15).toString('ascii').trim();
          if (/^\d{15}$/.test(candidate)) {
            parsedImei = candidate;
            consumed = 15;
          }
        }

        if (parsedImei) {
          imei = parsedImei;
          buffer = buffer.subarray(consumed);

          const vehicle = await getOrCreateVehicle(imei);
          if (!vehicle) {
            console.warn(`[SECURITY WARNING] [TELTONIKA] Handshake rejected for unregistered IMEI: ${imei} from ${clientAddr}`);
            socket.write(Buffer.from([0x00]));
            socket.destroy();
            return;
          }

          state = 'WAITING_AVL';
          console.log(`[TELTONIKA] Handshake accepted for verified vehicle ${vehicle.id} (Company: ${vehicle.company_id}, IMEI: ${imei})`);
          vehiclePromise = Promise.resolve(vehicle);
          socket.write(Buffer.from([0x01]));
        } else if (buffer.length > 32) {
          console.warn(`[TELTONIKA] Invalid IMEI handshake from ${clientAddr}, closing.`);
          socket.destroy();
        }
      }

      if (state === 'WAITING_AVL' && buffer.length >= 12) {
        const avlResult = parseAvlPacket(buffer);
        if (avlResult) {
          buffer = buffer.subarray(avlResult.bytesConsumed);
          console.log(
            `[TELTONIKA] Parsed ${avlResult.records.length} AVL records from IMEI: ${imei}`
          );

          const vehicle = vehiclePromise ? await vehiclePromise : null;

          for (const rec of avlResult.records) {
            await persistGpsRecord(vehicle, rec);
          }

          const ack = Buffer.alloc(4);
          ack.writeUInt32BE(avlResult.recordsCount, 0);
          socket.write(ack);
          console.log(`[TELTONIKA] Sent ACK for ${avlResult.recordsCount} records to ${imei}`);
        }
      }
    } catch (err) {
      console.error(`[TELTONIKA] Error processing packet from ${clientAddr}:`, err);
    }
  });

  socket.on('error', (err) => {
    console.error(`[TELTONIKA] Socket error (${clientAddr}):`, err.message);
  });

  socket.on('close', () => {
    console.log(`[TELTONIKA] Client disconnected: ${clientAddr} (IMEI: ${imei || 'unknown'})`);
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`🚀 [TELTONIKA] Raw TCP Ingestion Listener active on ${HOST}:${PORT}`);
  });
}

module.exports = { server, parseAvlPacket, getOrCreateVehicle, persistGpsRecord };
