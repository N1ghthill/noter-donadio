import { setTimeout as delay } from 'node:timers/promises';

import { createPrismaClient } from './config/database.js';
import { readEnvironment } from './config/env.js';
import { OutboxDispatcher } from './modules/outbox/domain/outbox-dispatcher.js';
import { BullMqEventPublisher } from './modules/outbox/infrastructure/bullmq-event.publisher.js';
import { PrismaOutboxRepository } from './modules/outbox/infrastructure/prisma-outbox.repository.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const publisher = new BullMqEventPublisher(environment.REDIS_URL);
const dispatcher = new OutboxDispatcher(new PrismaOutboxRepository(prisma), publisher);
const abortController = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => abortController.abort());
}

while (!abortController.signal.aborted) {
  const summary = await dispatcher.dispatchBatch();
  if (summary.claimed === 0) {
    await delay(1_000, undefined, { signal: abortController.signal }).catch(() => undefined);
  }
}

await publisher.close();
await prisma.$disconnect();
