import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createPrismaClient } from './config/database.js';
import { readBaileysEnvironment } from './config/baileys-env.js';
import { readEnvironment } from './config/env.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';
import {
  MediaDownloadService,
  type MediaDownloader,
} from './modules/media/domain/media-download.js';
import { FakeMediaDownloader } from './modules/media/infrastructure/fake-media-downloader.js';
import { BaileysMediaDownloader } from './modules/media/infrastructure/baileys-media-downloader.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { parseMediaDownloadJob } from './modules/media/infrastructure/media-download-job.js';
import { PrismaMediaDownloadRepository } from './modules/media/infrastructure/prisma-media-download.repository.js';
import { AuthStateCipher } from './modules/whatsapp/infrastructure/auth-state-cipher.js';
import { BaileysMediaReferenceCipher } from './modules/whatsapp/infrastructure/baileys-media-reference.js';

const environment = readEnvironment();
const logger = createAppLogger('media-download-worker');
const prisma = createPrismaClient(environment.DATABASE_URL);
let downloader: MediaDownloader;
if (environment.MEDIA_DOWNLOAD_ADAPTER === 'fake') {
  downloader = new FakeMediaDownloader();
} else if (environment.MEDIA_DOWNLOAD_ADAPTER === 'baileys') {
  const baileysEnvironment = readBaileysEnvironment();
  const cipher = new AuthStateCipher(
    new Map([[
      baileysEnvironment.BAILEYS_ENCRYPTION_KEY_VERSION,
      baileysEnvironment.BAILEYS_ENCRYPTION_KEY,
    ]]),
    baileysEnvironment.BAILEYS_ENCRYPTION_KEY_VERSION,
  );
  downloader = new BaileysMediaDownloader(
    prisma,
    new BaileysMediaReferenceCipher(cipher),
    environment.MEDIA_MAX_BYTES,
  );
} else {
  throw new Error('MEDIA_DOWNLOAD_ADAPTER precisa estar habilitado explicitamente');
}

const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de download de mídia');
});
const service = new MediaDownloadService(
  new PrismaMediaDownloadRepository(prisma),
  downloader,
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
