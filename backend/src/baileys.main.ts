import { AuthStateCipher } from './modules/whatsapp/infrastructure/auth-state-cipher.js';
import { BaileysSession } from './modules/whatsapp/infrastructure/baileys-session.js';
import { PrismaBaileysAuthStateRepository } from './modules/whatsapp/infrastructure/prisma-baileys-auth-state.repository.js';
import { PrismaWhatsappConnectionRepository } from './modules/whatsapp/infrastructure/prisma-whatsapp.repository.js';
import { RedisBaileysControl } from './modules/whatsapp/infrastructure/redis-baileys.gateway.js';
import { MessageIngestionService } from './modules/messages/domain/message-ingestion.js';
import { PrismaMessageIngestionRepository } from './modules/messages/infrastructure/prisma-message-ingestion.repository.js';
import { readBaileysEnvironment } from './config/baileys-env.js';
import { createPrismaClient } from './config/database.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const environment = readBaileysEnvironment();
const logger = createAppLogger('baileys');
const prisma = createPrismaClient(environment.DATABASE_URL);
const control = new RedisBaileysControl(environment.REDIS_URL);
const cipher = new AuthStateCipher(
  new Map([[environment.BAILEYS_ENCRYPTION_KEY_VERSION, environment.BAILEYS_ENCRYPTION_KEY]]),
  environment.BAILEYS_ENCRYPTION_KEY_VERSION,
);
const session = new BaileysSession(
  {
    workspaceId: environment.BAILEYS_WORKSPACE_ID,
    accountId: environment.BAILEYS_ACCOUNT_ID,
  },
  new PrismaBaileysAuthStateRepository(prisma, cipher),
  new PrismaWhatsappConnectionRepository(prisma),
  new MessageIngestionService(new PrismaMessageIngestionRepository(prisma)),
  control,
  logger,
);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await session.stop();
  await control.close();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown());
}

try {
  await session.run();
} catch (error: unknown) {
  logger.error(safeErrorContext(error), 'Processo Baileys interrompido');
  await shutdown();
  process.exitCode = 1;
}
