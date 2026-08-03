import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import OpenAI from 'openai';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { AudioTranscriptionService } from './modules/transcription/domain/audio-transcription.js';
import { FakeAudioTranscriber } from './modules/transcription/infrastructure/fake-audio-transcriber.js';
import { OpenAIAudioTranscriber } from './modules/transcription/infrastructure/openai-audio-transcriber.js';
import { PrismaAudioTranscriptionRepository } from './modules/transcription/infrastructure/prisma-audio-transcription.repository.js';
import { parseAudioTranscriptionJob } from './modules/transcription/infrastructure/transcription-job.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';

const environment = readEnvironment();
const logger = createAppLogger('transcription-worker');
if (environment.TRANSCRIPTION_ADAPTER === 'disabled') {
  throw new Error('TRANSCRIPTION_ADAPTER precisa estar habilitado');
}

const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de transcrição');
});
const processingNotBefore = environment.TRANSCRIPTION_ADAPTER === 'openai'
  ? requiredCutoff(environment.ASSISTIVE_PROCESSING_NOT_BEFORE)
  : null;
const transcriber = environment.TRANSCRIPTION_ADAPTER === 'fake'
  ? new FakeAudioTranscriber()
  : new OpenAIAudioTranscriber(
    new OpenAI({
      apiKey: requiredSecret(environment.OPENAI_API_KEY),
      timeout: environment.OPENAI_TIMEOUT_MS,
      maxRetries: environment.OPENAI_MAX_RETRIES,
      logLevel: 'error',
    }).audio.transcriptions,
    new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES),
    {
      model: environment.OPENAI_TRANSCRIPTION_MODEL,
      language: 'pt',
      persistedLanguage: 'pt-BR',
      maxDurationSeconds: environment.OPENAI_TRANSCRIPTION_MAX_DURATION_SECONDS,
    },
  );
const service = new AudioTranscriptionService(
  new PrismaAudioTranscriptionRepository(prisma),
  transcriber,
  processingNotBefore,
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
worker.on('failed', (job, error) => {
  logger.warn(
    { ...safeErrorContext(error), jobId: job?.id, attemptsMade: job?.attemptsMade },
    'Job de transcrição falhou; áudio original foi preservado',
  );
});

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(); });
}

function requiredSecret(value: string | undefined): string {
  if (!value) throw new Error('OPENAI_API_KEY é obrigatória para o adapter OpenAI');
  return value;
}

function requiredCutoff(value: string | undefined): Date {
  if (!value) {
    throw new Error('ASSISTIVE_PROCESSING_NOT_BEFORE é obrigatório para impedir backlog');
  }
  return new Date(value);
}
