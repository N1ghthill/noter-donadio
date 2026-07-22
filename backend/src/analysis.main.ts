import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { MessageAnalysisService } from './modules/analysis/domain/message-analysis.js';
import { parseMessageAnalysisJob } from './modules/analysis/infrastructure/analysis-job.js';
import { FakeMessageAnalyzer } from './modules/analysis/infrastructure/fake-message-analyzer.js';
import { PrismaMessageAnalysisRepository } from './modules/analysis/infrastructure/prisma-message-analysis.repository.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const environment = readEnvironment();
const logger = createAppLogger('analysis-worker');
if (environment.AI_ADAPTER !== 'fake') {
  throw new Error('AI_ADAPTER precisa estar configurado como fake');
}

const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de análise');
});
const service = new MessageAnalysisService(
  new PrismaMessageAnalysisRepository(prisma),
  new FakeMessageAnalyzer(),
);
const worker = new Worker(
  'ai-processing',
  async (job) => {
    const payload = parseMessageAnalysisJob(job.name, job.data);
    const result = await service.execute(payload.workspaceId, payload.messageId);
    if (result.status === 'busy') throw new Error('analysis_lease_busy');
  },
  { connection, concurrency: 2 },
);
worker.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha interna no worker de análise');
});

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(); });
}
