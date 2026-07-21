import { readEnvironment } from './config/env.js';
import { createPrismaClient } from './config/database.js';
import { MediaRetentionService } from './modules/media/domain/media-retention.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { PrismaMediaRetentionRepository } from './modules/media/infrastructure/prisma-media-retention.repository.js';

const BATCH_SIZE = 100;
const INTERVAL_MS = 60 * 60 * 1_000;

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const service = new MediaRetentionService(
  new PrismaMediaRetentionRepository(prisma),
  new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES),
);

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function sweep(): Promise<void> {
  if (stopping) return;
  try {
    let result = await service.runBatch(new Date(), BATCH_SIZE);
    while (!stopping && result.selected === BATCH_SIZE) {
      result = await service.runBatch(new Date(), BATCH_SIZE);
    }
  } catch {
    console.error('Falha no ciclo de retenção de mídia; uma nova tentativa será feita no próximo intervalo.');
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
