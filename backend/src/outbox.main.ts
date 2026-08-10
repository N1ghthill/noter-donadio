import { setTimeout as delay } from 'node:timers/promises';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { OutboxDispatcher } from './modules/outbox/domain/outbox-dispatcher.js';
import { BullMqEventPublisher } from './modules/outbox/infrastructure/bullmq-event.publisher.js';
import { PrismaOutboxRepository } from './modules/outbox/infrastructure/prisma-outbox.repository.js';
import { createAppLogger, safeErrorContext } from './config/logger.js';

const environment = readEnvironment();
const logger = createAppLogger('outbox-dispatcher');
const prisma = createPrismaClient(environment.DATABASE_URL);
const publisher = new BullMqEventPublisher(
  environment.REDIS_URL,
  logger,
  undefined,
  environment.NOTIFICATION_ADAPTER !== 'disabled',
);
const dispatcher = new OutboxDispatcher(new PrismaOutboxRepository(prisma), publisher);
const abortController = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => abortController.abort());
}

try {
  while (!abortController.signal.aborted) {
    const summary = await dispatcher.dispatchBatch();
    if (summary.failed > 0) {
      logger.warn(
        { claimed: summary.claimed, failed: summary.failed },
        'Eventos da outbox ficaram pendentes para nova tentativa',
      );
    }
    if (summary.claimed === 0) {
      await delay(1_000, undefined, { signal: abortController.signal }).catch(() => undefined);
    }
  }
} catch (error: unknown) {
  logger.error(safeErrorContext(error), 'Dispatcher da outbox foi interrompido por falha inesperada');
  process.exitCode = 1;
} finally {
  await publisher.close();
  await prisma.$disconnect();
}
