import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import OpenAI from 'openai';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { MessageAnalysisService } from './modules/analysis/domain/message-analysis.js';
import { parseMessageAnalysisJob } from './modules/analysis/infrastructure/analysis-job.js';
import { FakeMessageAnalyzer } from './modules/analysis/infrastructure/fake-message-analyzer.js';
import { OpenAIMessageAnalyzer } from './modules/analysis/infrastructure/openai-message-analyzer.js';
import { PrismaMessageAnalysisRepository } from './modules/analysis/infrastructure/prisma-message-analysis.repository.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const environment = readEnvironment();
const logger = createAppLogger('analysis-worker');
if (environment.AI_ADAPTER === 'disabled') {
  throw new Error('AI_ADAPTER precisa estar habilitado');
}

const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de análise');
});
const processingNotBefore = environment.AI_ADAPTER !== 'fake'
  ? requiredCutoff(environment.ASSISTIVE_PROCESSING_NOT_BEFORE)
  : null;
const analyzer = environment.AI_ADAPTER === 'fake'
  ? new FakeMessageAnalyzer()
  : new OpenAIMessageAnalyzer(
    new OpenAI({
      apiKey: requiredSecret(
        environment.AI_ADAPTER === 'groq' ? environment.GROQ_API_KEY : environment.OPENAI_API_KEY,
        environment.AI_ADAPTER === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY',
      ),
      ...(environment.AI_ADAPTER === 'groq' ? { baseURL: 'https://api.groq.com/openai/v1' } : {}),
      timeout: environment.AI_ADAPTER === 'groq' ? environment.GROQ_TIMEOUT_MS : environment.OPENAI_TIMEOUT_MS,
      maxRetries: environment.AI_ADAPTER === 'groq' ? environment.GROQ_MAX_RETRIES : environment.OPENAI_MAX_RETRIES,
      logLevel: 'error',
    }).responses,
    {
      model: environment.AI_ADAPTER === 'groq'
        ? environment.GROQ_ANALYSIS_MODEL
        : environment.OPENAI_ANALYSIS_MODEL,
      maxOutputTokens: environment.AI_ADAPTER === 'groq'
        ? environment.GROQ_ANALYSIS_MAX_OUTPUT_TOKENS
        : environment.OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS,
      sendStoreFalse: environment.AI_ADAPTER === 'openai',
    },
  );
const service = new MessageAnalysisService(
  new PrismaMessageAnalysisRepository(prisma),
  analyzer,
  processingNotBefore,
);
const worker = new Worker(
  'ai-processing',
  async (job) => {
    const payload = parseMessageAnalysisJob(job.name, job.data);
    const result = await service.execute(payload.workspaceId, payload.messageId);
    if (result.status === 'busy') throw new Error('analysis_lease_busy');
  },
  { connection, concurrency: environment.AI_ADAPTER === 'groq' ? 1 : 2 },
);
worker.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha interna no worker de análise');
});
worker.on('failed', (job, error) => {
  logger.warn(
    { ...safeErrorContext(error), jobId: job?.id, attemptsMade: job?.attemptsMade },
    'Job de análise falhou; conteúdo da mensagem foi preservado',
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
