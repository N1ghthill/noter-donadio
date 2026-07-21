import { readEnvironment } from './config/env.js';
import { createPrismaClient } from './config/database.js';
import { buildApp } from './app.js';
import { MessageIngestionService } from './modules/messages/domain/message-ingestion.js';
import { DemoMessageService } from './modules/messages/domain/demo-message.js';
import { PrismaMessageIngestionRepository } from './modules/messages/infrastructure/prisma-message-ingestion.repository.js';
import { PrismaConversationRepository } from './modules/messages/infrastructure/prisma-conversation.repository.js';
import { PrismaConnectedWhatsappAccountRepository } from './modules/messages/infrastructure/prisma-connected-whatsapp-account.repository.js';
import { PrismaCrmRepository } from './modules/crm/infrastructure/prisma-crm.repository.js';
import { AuthService } from './modules/auth/domain/auth.service.js';
import { ScryptPasswordHasher } from './modules/auth/domain/password-hasher.js';
import { PrismaAuthRepository } from './modules/auth/infrastructure/prisma-auth.repository.js';
import { attachRealtimeServer } from './modules/realtime/http/realtime.server.js';
import { WhatsappConnectionService } from './modules/whatsapp/domain/whatsapp-connection.js';
import { FakeWhatsappGateway } from './modules/whatsapp/infrastructure/fake-whatsapp.gateway.js';
import { PrismaWhatsappConnectionRepository } from './modules/whatsapp/infrastructure/prisma-whatsapp.repository.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const ingestionRepository = new PrismaMessageIngestionRepository(prisma);
const ingestionService = new MessageIngestionService(ingestionRepository);
const conversationRepository = new PrismaConversationRepository(prisma);
const demoMessageService = environment.WHATSAPP_ADAPTER === 'fake'
  ? new DemoMessageService(new PrismaConnectedWhatsappAccountRepository(prisma), ingestionService)
  : undefined;
const authService = new AuthService(new PrismaAuthRepository(prisma), new ScryptPasswordHasher());
const whatsappService = environment.WHATSAPP_ADAPTER === 'fake'
  ? new WhatsappConnectionService(
      new PrismaWhatsappConnectionRepository(prisma),
      new FakeWhatsappGateway(),
    )
  : undefined;
const app = buildApp({
  ingestionService,
  internalIngestionToken: environment.INTERNAL_INGESTION_TOKEN,
  crmRepository: new PrismaCrmRepository(prisma),
  authService,
  secureCookie: environment.NODE_ENV === 'production',
  conversationRepository,
  ...(demoMessageService ? { demoMessageService } : {}),
  ...(whatsappService ? { whatsappService } : {}),
});
attachRealtimeServer(app, { sessionAuthenticator: authService, redisUrl: environment.REDIS_URL });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(async () => {
      await prisma.$disconnect();
    });
  });
}

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error: unknown) {
  app.log.error({ err: error }, 'Falha ao iniciar o backend');
  await prisma.$disconnect();
  process.exitCode = 1;
}
