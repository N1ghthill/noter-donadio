import { readEnvironment } from './config/env.js';
import { createPrismaClient } from './config/database.js';
import { MediaRetentionService } from './modules/media/domain/media-retention.js';
import { MediaOrphanReconciliationService } from './modules/media/domain/media-orphan-reconciliation.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { PrismaMediaReferenceRepository } from './modules/media/infrastructure/prisma-media-reference.repository.js';
import { PrismaMediaRetentionRepository } from './modules/media/infrastructure/prisma-media-retention.repository.js';
import { ContactDeletionService } from './modules/privacy/domain/contact-deletion.js';
import { PrismaContactDeletionRepository } from './modules/privacy/infrastructure/prisma-contact-deletion.repository.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const BATCH_SIZE = 100;
const INTERVAL_MS = 60 * 60 * 1_000;

const environment = readEnvironment();
const logger = createAppLogger('media-retention');
const prisma = createPrismaClient(environment.DATABASE_URL);
const mediaStorage = new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES);
const service = new MediaRetentionService(
  new PrismaMediaRetentionRepository(prisma),
  mediaStorage,
);
const orphanReconciliationService = new MediaOrphanReconciliationService(
  new PrismaMediaReferenceRepository(prisma),
  mediaStorage,
  environment.MEDIA_ORPHAN_GRACE_HOURS * 60 * 60 * 1_000,
);
const pendingDeletionService = new ContactDeletionService(
  new PrismaContactDeletionRepository(prisma),
  mediaStorage,
);

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function sweep(): Promise<void> {
  if (stopping) return;
  try {
    let deletionResult = await pendingDeletionService.flushPendingMedia(BATCH_SIZE);
    while (!stopping && deletionResult.selected === BATCH_SIZE && deletionResult.completedMedia > 0) {
      deletionResult = await pendingDeletionService.flushPendingMedia(BATCH_SIZE);
    }
    if (deletionResult.pendingMedia > 0) {
      logger.warn(
        { pendingMedia: deletionResult.pendingMedia },
        'Remoções físicas de mídia continuam pendentes para nova tentativa',
      );
    }
    let result = await service.runBatch(new Date(), BATCH_SIZE);
    while (!stopping && result.selected === BATCH_SIZE) {
      result = await service.runBatch(new Date(), BATCH_SIZE);
    }
    const reconciliation = await orphanReconciliationService.runBatch(new Date(), BATCH_SIZE);
    if (reconciliation.removed > 0) {
      logger.info(
        { removedMedia: reconciliation.removed },
        'Mídias órfãs antigas foram removidas do armazenamento privado',
      );
    }
  } catch (error: unknown) {
    logger.error(
      safeErrorContext(error),
      'Falha no ciclo de retenção de mídia; nova tentativa será feita no próximo intervalo',
    );
  } finally {
    if (!stopping) timer = setTimeout(() => void sweep(), INTERVAL_MS);
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown());
}

void sweep();
