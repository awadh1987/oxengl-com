import net from 'net';

const TARGET_PORT = parseInt(process.argv[2] || '15000', 10);
const TARGET_HOST = process.argv[3] || '127.0.0.1';
const TEST_IMEI = '860123456789012';

console.log(`[TEST CLIENT] Connecting to Teltonika ingestion gateway at ${TARGET_HOST}:${TARGET_PORT}...`);

const client = new net.Socket();

client.connect(TARGET_PORT, TARGET_HOST, () => {
  console.log('[TEST CLIENT] Connected to gateway. Sending 15-byte IMEI handshake...');
  // Format: 2-byte length (15) + 15 ASCII bytes
  const imeiPayload = Buffer.alloc(17);
  imeiPayload.writeUInt16BE(15, 0);
  imeiPayload.write(TEST_IMEI, 2, 'ascii');
  client.write(imeiPayload);
});

let step = 'WAIT_HANDSHAKE';

client.on('data', (data) => {
  if (step === 'WAIT_HANDSHAKE') {
    if (data.length >= 1 && data[0] === 0x01) {
      console.log('[TEST CLIENT] Received Handshake Acceptance (0x01).');
      step = 'WAIT_ACK';

      // Build Codec 8 AVL Packet with 1 record (Riyadh, KSA coordinates)
      const recordsCount = 1;
      const now = BigInt(Date.now());
      const lon = Math.round(46.6753 * 10000000); // 46.675300 E
      const lat = Math.round(24.7136 * 10000000); // 24.713600 N
      const alt = 612; // meters
      const angle = 90;
      const satellites = 12;
      const speed = 75; // km/h

      // AVL record payload buffer
      const recBuf = Buffer.alloc(8 + 1 + 4 + 4 + 2 + 2 + 1 + 2 + 6);
      let offset = 0;
      recBuf.writeBigUInt64BE(now, offset); offset += 8;
      recBuf.writeUInt8(1, offset); offset += 1; // Priority High
      recBuf.writeInt32BE(lon, offset); offset += 4;
      recBuf.writeInt32BE(lat, offset); offset += 4;
      recBuf.writeInt16BE(alt, offset); offset += 2;
      recBuf.writeUInt16BE(angle, offset); offset += 2;
      recBuf.writeUInt8(satellites, offset); offset += 1;
      recBuf.writeUInt16BE(speed, offset); offset += 2;
      // Empty IO
      recBuf.writeUInt8(0, offset); offset += 1; // Event IO ID
      recBuf.writeUInt8(0, offset); offset += 1; // Total IO
      recBuf.writeUInt8(0, offset); offset += 1; // n1
      recBuf.writeUInt8(0, offset); offset += 1; // n2
      recBuf.writeUInt8(0, offset); offset += 1; // n4
      recBuf.writeUInt8(0, offset); offset += 1; // n8

      // Header: 1 byte Codec ID (0x08) + 1 byte recordsCount (1)
      // Footer: 1 byte recordsCount (1)
      const avlDataLength = 1 + 1 + recBuf.length + 1; // 2 + recBuf.length + 1

      const packet = Buffer.alloc(4 + 4 + avlDataLength + 4);
      let pOffset = 0;
      packet.writeUInt32BE(0, pOffset); pOffset += 4; // Preamble
      packet.writeUInt32BE(avlDataLength, pOffset); pOffset += 4;
      packet.writeUInt8(0x08, pOffset); pOffset += 1; // Codec 8
      packet.writeUInt8(recordsCount, pOffset); pOffset += 1;
      recBuf.copy(packet, pOffset); pOffset += recBuf.length;
      packet.writeUInt8(recordsCount, pOffset); pOffset += 1;
      packet.writeUInt32BE(0x12345678, pOffset); pOffset += 4; // CRC

      console.log(`[TEST CLIENT] Sending Codec 8 AVL packet (${packet.length} bytes)...`);
      client.write(packet);
    } else {
      console.error('[TEST CLIENT] Unexpected handshake response:', data);
      client.destroy();
      process.exit(1);
    }
  } else if (step === 'WAIT_ACK') {
    if (data.length >= 4) {
      const ackCount = data.readUInt32BE(0);
      console.log(`[TEST CLIENT] Received Server ACK for ${ackCount} records!`);
      if (ackCount === 1) {
        console.log('✅ [TEST CLIENT] Telemetry Ingestion Verification SUCCESS!');
        client.end();
        process.exit(0);
      } else {
        console.error(`[TEST CLIENT] ACK count mismatch: expected 1, got ${ackCount}`);
        client.destroy();
        process.exit(1);
      }
    }
  }
});

client.on('error', (err) => {
  console.error('[TEST CLIENT] Error:', err.message);
  process.exit(1);
});

client.on('close', () => {
  console.log('[TEST CLIENT] Connection closed.');
});
