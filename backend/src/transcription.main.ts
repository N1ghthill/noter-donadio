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
const processingNotBefore = environment.TRANSCRIPTION_ADAPTER !== 'fake'
  ? requiredCutoff(environment.ASSISTIVE_PROCESSING_NOT_BEFORE)
  : null;
const transcriber = environment.TRANSCRIPTION_ADAPTER === 'fake'
  ? new FakeAudioTranscriber()
  : new OpenAIAudioTranscriber(
    new OpenAI({
      apiKey: requiredSecret(
        environment.TRANSCRIPTION_ADAPTER === 'groq'
          ? environment.GROQ_API_KEY
          : environment.OPENAI_API_KEY,
        environment.TRANSCRIPTION_ADAPTER === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY',
      ),
      ...(environment.TRANSCRIPTION_ADAPTER === 'groq'
        ? { baseURL: 'https://api.groq.com/openai/v1' }
        : {}),
      timeout: environment.TRANSCRIPTION_ADAPTER === 'groq'
        ? environment.GROQ_TIMEOUT_MS
        : environment.OPENAI_TIMEOUT_MS,
      maxRetries: environment.TRANSCRIPTION_ADAPTER === 'groq'
        ? environment.GROQ_MAX_RETRIES
        : environment.OPENAI_MAX_RETRIES,
      logLevel: 'error',
    }).audio.transcriptions,
    new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES),
    {
      model: environment.TRANSCRIPTION_ADAPTER === 'groq'
        ? environment.GROQ_TRANSCRIPTION_MODEL
        : environment.OPENAI_TRANSCRIPTION_MODEL,
      language: 'pt',
      persistedLanguage: 'pt-BR',
      maxDurationSeconds: environment.TRANSCRIPTION_ADAPTER === 'groq'
        ? environment.GROQ_TRANSCRIPTION_MAX_DURATION_SECONDS
        : environment.OPENAI_TRANSCRIPTION_MAX_DURATION_SECONDS,
      includeLogprobs: environment.TRANSCRIPTION_ADAPTER === 'openai',
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

function requiredSecret(value: string | undefined, name: 'OPENAI_API_KEY' | 'GROQ_API_KEY'): string {
  if (!value) throw new Error(`${name} é obrigatória para o adapter externo selecionado`);
  return value;
}

function requiredCutoff(value: string | undefined): Date {
  if (!value) {
    throw new Error('ASSISTIVE_PROCESSING_NOT_BEFORE é obrigatório para impedir backlog');
  }
  return new Date(value);
}
