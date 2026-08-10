import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';
import { InboundMessageNotificationService } from './modules/notifications/domain/inbound-message-notification.js';
import { BarkNotifier } from './modules/notifications/infrastructure/bark-notifier.js';
import { parseInboundMessageNotificationJob } from './modules/notifications/infrastructure/notification-job.js';
import { PrismaInboundMessageNotificationRepository } from './modules/notifications/infrastructure/prisma-inbound-message-notification.repository.js';

const environment = readEnvironment();
const logger = createAppLogger('notification-worker');
if (environment.NOTIFICATION_ADAPTER !== 'bark') {
  throw new Error('NOTIFICATION_ADAPTER precisa estar configurado como bark');
}

const webhookUrl = requiredValue(environment.BARK_WEBHOOK_URL, 'BARK_WEBHOOK_URL');
const notBefore = requiredCutoff(environment.NOTIFICATION_NOT_BEFORE);
const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha na conexão Redis do worker de notificações');
});
const service = new InboundMessageNotificationService(
  new PrismaInboundMessageNotificationRepository(prisma),
  new BarkNotifier(
    webhookUrl,
    environment.BARK_NOTIFICATION_OPEN_URL,
    fetch,
    environment.BARK_TIMEOUT_MS,
    environment.BARK_OPERATIONAL_WEBHOOK_URL
      ? {
          webhookUrl: environment.BARK_OPERATIONAL_WEBHOOK_URL,
          openUrl: environment.BARK_OPERATIONAL_OPEN_URL,
        }
      : undefined,
  ),
  notBefore,
);
const worker = new Worker(
  'inbound-notifications',
  async (job) => {
    const payload = parseInboundMessageNotificationJob(job.name, job.data);
    const result = await service.execute(
      payload.workspaceId,
      payload.messageId,
      payload.milestone,
    );
    if (result.status === 'busy') throw new Error('notification_lease_busy');
  },
  { connection, concurrency: 1 },
);

worker.on('error', (error) => {
  logger.error(safeErrorContext(error), 'Falha interna no worker de notificações');
});
worker.on('failed', (job, error) => {
  logger.warn(
    { ...safeErrorContext(error), jobId: job?.id, attemptsMade: job?.attemptsMade },
    'Job de notificação falhou e será tentado novamente',
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

function requiredValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} é obrigatória para notificações Bark`);
  return value;
}

function requiredCutoff(value: string | undefined): Date {
  if (!value) throw new Error('NOTIFICATION_NOT_BEFORE é obrigatório para impedir backlog');
  return new Date(value);
}
