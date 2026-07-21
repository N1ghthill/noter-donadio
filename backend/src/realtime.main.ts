import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { readEnvironment } from './config/env.js';
import { REALTIME_EVENT_NAME, workspaceRoom } from './modules/realtime/http/realtime.server.js';
import { parseRealtimeEvent } from './modules/realtime/infrastructure/realtime-event.js';

const environment = readEnvironment();
const workerConnection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
const emitterConnection = new Redis(environment.REDIS_URL);
workerConnection.on('error', () => undefined);
emitterConnection.on('error', () => undefined);

const emitter = new Emitter(emitterConnection);
const worker = new Worker(
  'realtime-events',
  async (job) => {
    const event = parseRealtimeEvent(job.name, job.data);
    emitter.to(workspaceRoom(event.workspaceId)).emit(REALTIME_EVENT_NAME, event);
  },
  { connection: workerConnection, concurrency: 10 },
);
worker.on('error', () => undefined);

async function shutdown(): Promise<void> {
  await worker.close();
  await Promise.all([workerConnection.quit(), emitterConnection.quit()]);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(); });
}
