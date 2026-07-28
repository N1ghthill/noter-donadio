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
import { MetaCloudIngestionService } from './modules/whatsapp/domain/meta-cloud-ingestion.js';
import { PrismaMetaCloudAccountMappingRepository } from './modules/whatsapp/infrastructure/prisma-meta-cloud-account.repository.js';
import type { MetaCloudWebhookRouteOptions } from './modules/whatsapp/http/meta-cloud-webhook.routes.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { FakeDemoAudioProvisioner } from './modules/media/infrastructure/fake-demo-audio.provisioner.js';
import { MediaAccessService } from './modules/media/domain/media-access.js';
import { PrismaMediaAccessRepository } from './modules/media/infrastructure/prisma-media-access.repository.js';
import { ContactDeletionService } from './modules/privacy/domain/contact-deletion.js';
import { PrismaContactDeletionRepository } from './modules/privacy/infrastructure/prisma-contact-deletion.repository.js';
import { PrismaWorkspaceExportRepository } from './modules/privacy/infrastructure/prisma-workspace-export.repository.js';
import { PrismaAuditLogRepository } from './modules/privacy/infrastructure/prisma-audit-log.repository.js';
import { DependencyReadinessProbe } from './modules/health/infrastructure/dependency-readiness.js';
import { PrismaBullMqOperationalMetricsCollector } from './modules/health/infrastructure/operational-metrics.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const ingestionRepository = new PrismaMessageIngestionRepository(prisma);
const ingestionService = new MessageIngestionService(ingestionRepository);
const conversationRepository = new PrismaConversationRepository(prisma);
const mediaStorage = new LocalMediaStorage(environment.MEDIA_STORAGE_PATH, environment.MEDIA_MAX_BYTES);
const contactDeletionService = new ContactDeletionService(
  new PrismaContactDeletionRepository(prisma),
  mediaStorage,
);
const readinessProbe = new DependencyReadinessProbe(prisma, environment.REDIS_URL);
const metricsCollector = new PrismaBullMqOperationalMetricsCollector(prisma, environment.REDIS_URL);
const demoMessageService = environment.WHATSAPP_ADAPTER === 'fake'
  ? new DemoMessageService(
      new PrismaConnectedWhatsappAccountRepository(prisma),
      ingestionService,
      new FakeDemoAudioProvisioner(mediaStorage, environment.MEDIA_RETENTION_DAYS),
    )
  : undefined;
const authService = new AuthService(new PrismaAuthRepository(prisma), new ScryptPasswordHasher());
const whatsappService = environment.WHATSAPP_ADAPTER === 'fake'
  ? new WhatsappConnectionService(
      new PrismaWhatsappConnectionRepository(prisma),
      new FakeWhatsappGateway(),
    )
  : undefined;
let metaCloudWebhook: MetaCloudWebhookRouteOptions | undefined;
if (environment.META_WEBHOOK_ENABLED) {
  if (!environment.META_WEBHOOK_VERIFY_TOKEN || !environment.META_APP_SECRET) {
    throw new Error('Configuração do webhook Meta incompleta');
  }
  const metaCloudIngestion = new MetaCloudIngestionService(
    new PrismaMetaCloudAccountMappingRepository(prisma),
    {
      ingest: (command) => ingestionService.execute(command),
    },
    environment.META_WEBHOOK_AUDIO_ENABLED,
  );
  metaCloudWebhook = {
    verifyToken: environment.META_WEBHOOK_VERIFY_TOKEN,
    appSecret: environment.META_APP_SECRET,
    ingestionService: metaCloudIngestion,
  };
}
const app = buildApp({
  trustProxy: environment.NODE_ENV === 'production',
  ingestionService,
  internalIngestionToken: environment.INTERNAL_INGESTION_TOKEN,
  crmRepository: new PrismaCrmRepository(prisma),
  authService,
  secureCookie: environment.NODE_ENV === 'production',
  conversationRepository,
  mediaAccessService: new MediaAccessService(
    new PrismaMediaAccessRepository(prisma),
    mediaStorage,
    environment.MEDIA_SIGNING_SECRET,
  ),
  contactDeletionService,
  workspaceExportRepository: new PrismaWorkspaceExportRepository(prisma),
  auditLogRepository: new PrismaAuditLogRepository(prisma),
  allowedOrigins: environment.APP_ORIGINS,
  readinessProbe,
  metricsCollector,
  ...(demoMessageService ? { demoMessageService } : {}),
  ...(whatsappService ? { whatsappService } : {}),
  ...(metaCloudWebhook ? { metaCloudWebhook } : {}),
});
attachRealtimeServer(app, { sessionAuthenticator: authService, redisUrl: environment.REDIS_URL });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(async () => {
      readinessProbe.close();
      await metricsCollector.close();
      await prisma.$disconnect();
    });
  });
}

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error: unknown) {
  app.log.error({ err: error }, 'Falha ao iniciar o backend');
  readinessProbe.close();
  await metricsCollector.close();
  await prisma.$disconnect();
  process.exitCode = 1;
}
