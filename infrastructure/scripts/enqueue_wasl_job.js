import { Queue } from 'bullmq';
import 'dotenv/config';

const QUEUE_NAME = 'wasl-compliance-queue';

const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

if (process.env.REDIS_PASSWORD) {
  redisConnection.password = process.env.REDIS_PASSWORD;
}

const waslQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

async function enqueueMockJobs() {
  console.log(`[TEST DISPATCHER] Enqueuing test compliance jobs to "${QUEUE_NAME}"...`);

  // 1. Enqueue Vehicle Sync Job
  const vehicleJob = await waslQueue.add(
    'SYNC_VEHICLE',
    {
      type: 'SYNC_VEHICLE',
      payload: {
        sequenceNumber: '1092837465',
        plateLetterRight: 'أ',
        plateLetterMiddle: 'ب',
        plateLetterLeft: 'ج',
        plateNumber: '1234',
      },
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
  console.log(`[TEST DISPATCHER] Enqueued SYNC_VEHICLE job ID: ${vehicleJob.id}`);

  // 2. Enqueue Driver Validation Job
  const driverJob = await waslQueue.add(
    'VALIDATE_DRIVER',
    {
      type: 'VALIDATE_DRIVER',
      payload: {
        identityNumber: '2456789123',
        mobileNumber: '+966501234567',
      },
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
  console.log(`[TEST DISPATCHER] Enqueued VALIDATE_DRIVER job ID: ${driverJob.id}`);

  // 3. Enqueue Telemetry Ping Job
  const telemetryJob = await waslQueue.add(
    'DISPATCH_TELEMETRY',
    {
      type: 'DISPATCH_TELEMETRY',
      payload: {
        sequenceNumber: '1092837465',
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 82.5,
        heading: 180,
        timestamp: new Date().toISOString(),
      },
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );
  console.log(`[TEST DISPATCHER] Enqueued DISPATCH_TELEMETRY job ID: ${telemetryJob.id}`);

  console.log('✅ [TEST DISPATCHER] All 3 test compliance jobs successfully submitted to queue.');

  await waslQueue.close();
  process.exit(0);
}

enqueueMockJobs().catch((err) => {
  console.error('[TEST DISPATCHER] Error enqueuing jobs:', err);
  process.exit(1);
});
