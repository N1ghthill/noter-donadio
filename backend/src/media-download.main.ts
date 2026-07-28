import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';
import { MediaDownloadService } from './modules/media/domain/media-download.js';
import { FakeMediaDownloader } from './modules/media/infrastructure/fake-media-downloader.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { parseMediaDownloadJob } from './modules/media/infrastructure/media-download-job.js';
import { PrismaMediaDownloadRepository } from './modules/media/infrastructure/prisma-media-download.repository.js';

const environment = readEnvironment();
const logger = createAppLogger('media-download-worker');
if (environment.MEDIA_DOWNLOAD_ADAPTER !== 'fake') {
  throw new Error('MEDIA_DOWNLOAD_ADAPTER precisa estar configurado como fake');
}

const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de download de mídia');
});
const service = new MediaDownloadService(
  new PrismaMediaDownloadRepository(prisma),
  new FakeMediaDownloader(),
  new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES),
  environment.MEDIA_RETENTION_DAYS,
);
const worker = new Worker(
  'media-download',
  async (job) => {
    const payload = parseMediaDownloadJob(job.name, job.data);
    const result = await service.execute(payload.workspaceId, payload.messageId);
    if (result.status === 'busy') throw new Error('media_download_lease_busy');
  },
  { connection, concurrency: 2 },
);
worker.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha interna no worker de download de mídia');
});

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void shutdown(); });
}
