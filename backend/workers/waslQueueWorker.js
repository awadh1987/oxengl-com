import { Worker, Queue } from 'bullmq';
import waslClient from '../services/waslClient.js';
import 'dotenv/config';

const QUEUE_NAME = 'wasl-compliance-queue';

const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

if (process.env.REDIS_PASSWORD) {
  redisConnection.password = process.env.REDIS_PASSWORD;
}

// Dead Letter Queue for terminal failures
const dlqQueue = new Queue('wasl-compliance-dlq', {
  connection: redisConnection,
});

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 1000,
  removeOnFail: false,
};

async function processWaslJob(job) {
  const { type, payload } = job.data;
  console.log(`[WASL WORKER] Processing job ${job.id} (Attempt ${job.attemptsMade + 1}/3) [Type: ${type || job.name}]`);

  const jobType = type || job.name;

  switch (jobType) {
    case 'DISPATCH_TELEMETRY':
    case 'telemetry':
      return await waslClient.sendTelemetryPing(payload || job.data);

    case 'SYNC_VEHICLE':
    case 'vehicle':
      return await waslClient.registerVehicle(payload || job.data);

    case 'VALIDATE_DRIVER':
    case 'driver':
      return await waslClient.validateDriver(payload || job.data);

    default:
      console.warn(`[WASL WORKER] Unknown job type: ${jobType}, treating as telemetry`);
      return await waslClient.sendTelemetryPing(payload || job.data);
  }
}

const worker = new Worker(QUEUE_NAME, processWaslJob, {
  connection: redisConnection,
  concurrency: 5,
});

worker.on('completed', (job, result) => {
  console.log(`✅ [WASL WORKER] Job ${job.id} (${job.name}) completed successfully:`, result);
});

worker.on('failed', async (job, err) => {
  console.error(`❌ [WASL WORKER] Job ${job?.id} (${job?.name}) failed: ${err.message}`);

  if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
    console.error(
      `🚨 [WASL DLQ CRITICAL] Job ${job.id} exhausted all ${job.attemptsMade} retry attempts. Routing to Dead-Letter Queue.`
    );
    try {
      await dlqQueue.add('dead-letter-telemetry', {
        originalJobId: job.id,
        originalQueue: QUEUE_NAME,
        failedAt: new Date().toISOString(),
        error: err.message,
        payload: job.data,
      });
      console.log(`[WASL DLQ] Safely archived job ${job.id} into Dead-Letter Queue.`);
    } catch (dlqErr) {
      console.error(`[WASL DLQ ERROR] Failed to push to DLQ:`, dlqErr.message);
    }
  }
});

worker.on('error', (err) => {
  console.error('[WASL WORKER] Internal Worker Error:', err.message);
});

console.log(`🚀 [WASL WORKER] Queue Worker listening on queue "${QUEUE_NAME}" (Redis ${redisConnection.host}:${redisConnection.port})`);

export { worker, defaultJobOptions, redisConnection, QUEUE_NAME };
export default worker;
