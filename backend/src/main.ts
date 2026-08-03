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
import { RedisBaileysGateway } from './modules/whatsapp/infrastructure/redis-baileys.gateway.js';
import { LocalMediaStorage } from './modules/media/infrastructure/local-media-storage.js';
import { FakeDemoAudioProvisioner } from './modules/media/infrastructure/fake-demo-audio.provisioner.js';
import { MediaAccessService } from './modules/media/domain/media-access.js';
import { PrismaMediaAccessRepository } from './modules/media/infrastructure/prisma-media-access.repository.js';
import { PrismaContactFileRepository } from './modules/media/infrastructure/prisma-contact-file.repository.js';
import { ContactDeletionService } from './modules/privacy/domain/contact-deletion.js';
import { PrismaContactDeletionRepository } from './modules/privacy/infrastructure/prisma-contact-deletion.repository.js';
import { PrismaWorkspaceExportRepository } from './modules/privacy/infrastructure/prisma-workspace-export.repository.js';
import { PrismaAuditLogRepository } from './modules/privacy/infrastructure/prisma-audit-log.repository.js';
import { DependencyReadinessProbe } from './modules/health/infrastructure/dependency-readiness.js';
import { PrismaBullMqOperationalMetricsCollector } from './modules/health/infrastructure/operational-metrics.js';
import { PrismaProcessingFailureRepository } from './modules/operations/infrastructure/prisma-processing-failure.repository.js';

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
const metricsCollector = new PrismaBullMqOperationalMetricsCollector(
  prisma,
  environment.REDIS_URL,
  undefined,
  {
    transcriptionEnabled: environment.TRANSCRIPTION_FEATURE_ENABLED,
    analysisEnabled: environment.AI_ANALYSIS_FEATURE_ENABLED,
  },
);
const demoMessageService = environment.WHATSAPP_ADAPTER === 'fake'
  ? new DemoMessageService(
      new PrismaConnectedWhatsappAccountRepository(prisma),
      ingestionService,
      new FakeDemoAudioProvisioner(mediaStorage, environment.MEDIA_RETENTION_DAYS),
    )
  : undefined;
const authService = new AuthService(new PrismaAuthRepository(prisma), new ScryptPasswordHasher());
const processingNotBefore = environment.ASSISTIVE_PROCESSING_NOT_BEFORE
  ? new Date(environment.ASSISTIVE_PROCESSING_NOT_BEFORE)
  : undefined;
const whatsappGateway = environment.WHATSAPP_ADAPTER === 'fake'
  ? new FakeWhatsappGateway()
  : environment.WHATSAPP_ADAPTER === 'baileys'
    ? new RedisBaileysGateway(environment.REDIS_URL)
    : undefined;
const whatsappService = whatsappGateway
  ? new WhatsappConnectionService(
      new PrismaWhatsappConnectionRepository(prisma),
      whatsappGateway,
    )
  : undefined;
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
  contactFileRepository: new PrismaContactFileRepository(prisma),
  contactDeletionService,
  workspaceExportRepository: new PrismaWorkspaceExportRepository(prisma),
  auditLogRepository: new PrismaAuditLogRepository(prisma),
  ...(processingNotBefore ? {
    processingFailureRepository: new PrismaProcessingFailureRepository(prisma),
    processingNotBefore,
  } : {}),
  allowedOrigins: environment.APP_ORIGINS,
  readinessProbe,
  metricsCollector,
  productCapabilities: {
    demoSimulationEnabled: demoMessageService !== undefined,
    audioTranscriptionEnabled: environment.TRANSCRIPTION_FEATURE_ENABLED,
    messageAnalysisEnabled: environment.AI_ANALYSIS_FEATURE_ENABLED,
  },
  ...(demoMessageService ? { demoMessageService } : {}),
  ...(whatsappService ? { whatsappService } : {}),
});
attachRealtimeServer(app, { sessionAuthenticator: authService, redisUrl: environment.REDIS_URL });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().finally(async () => {
      readinessProbe.close();
      await metricsCollector.close();
      if (whatsappGateway instanceof RedisBaileysGateway) await whatsappGateway.close();
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
  if (whatsappGateway instanceof RedisBaileysGateway) await whatsappGateway.close();
  await prisma.$disconnect();
  process.exitCode = 1;
}
