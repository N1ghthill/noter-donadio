import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaOutboxRepository } from './prisma-outbox.repository.js';

test('conclusão da outbox tolera remoção concorrente do evento', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  context.after(async () => prisma.$disconnect());
  const repository = new PrismaOutboxRepository(prisma);
  const removedEventId = randomUUID();

  await repository.markPublished(removedEventId);
  await repository.markFailed(removedEventId, 'TEST_FAILURE', new Date());

  assert.equal(await prisma.outboxEvent.count({ where: { id: removedEventId } }), 0);
});
