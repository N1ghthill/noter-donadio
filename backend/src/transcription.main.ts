import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { AudioTranscriptionService } from './modules/transcription/domain/audio-transcription.js';
import { FakeAudioTranscriber } from './modules/transcription/infrastructure/fake-audio-transcriber.js';
import { PrismaAudioTranscriptionRepository } from './modules/transcription/infrastructure/prisma-audio-transcription.repository.js';
import { parseAudioTranscriptionJob } from './modules/transcription/infrastructure/transcription-job.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const environment = readEnvironment();
const logger = createAppLogger('transcription-worker');
if (environment.TRANSCRIPTION_ADAPTER !== 'fake') {
  throw new Error('TRANSCRIPTION_ADAPTER precisa estar configurado como fake');
}

const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de transcrição');
});
const service = new AudioTranscriptionService(
  new PrismaAudioTranscriptionRepository(prisma),
  new FakeAudioTranscriber(),
);
const worker = new Worker(
  'audio-transcription',
  async (job) => {
    const payload = parseAudioTranscriptionJob(job.name, job.data);
    const result = await service.execute(payload.workspaceId, payload.messageId);
    if (result.status === 'busy') throw new Error('transcription_lease_busy');
  },
  { connection, concurrency: 2 },
);
worker.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha interna no worker de transcrição');
});

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(); });
}
