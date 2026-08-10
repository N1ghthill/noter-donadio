import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaNotificationStatusRepository } from './prisma-notification-status.repository.js';

test('resume atividade por workspace sem consultar conteúdo', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const messageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `notification-status-${workspaceId}`,
      name: 'Workspace fictício',
      whatsappAccounts: { create: { id: accountId, identifier: `account-${accountId}` } },
      contacts: {
        create: {
          id: contactId,
          phoneNumber: '5571000000506',
          displayName: 'Contato fictício',
          source: 'manual',
        },
      },
    },
  });
  await prisma.message.create({
    data: {
      id: messageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: `status-${messageId}`,
      contactId,
      direction: 'inbound',
      messageType: 'text',
      content: 'Conteúdo sintético que não participa do resumo.',
      occurredAt: new Date('2026-08-10T16:00:00Z'),
    },
  });
  await prisma.notificationDelivery.createMany({
    data: [
      {
        workspaceId,
        messageId,
        channel: 'bark',
        kind: 'message_received',
        state: 'completed',
        completedAt: new Date('2026-08-10T16:00:12Z'),
      },
      {
        workspaceId,
        messageId,
        channel: 'bark',
        kind: 'analysis_completed',
        state: 'pending',
      },
    ],
  });

  assert.deepEqual(await new PrismaNotificationStatusRepository(prisma).get(workspaceId), {
    lastInboundMessageAt: new Date('2026-08-10T16:00:00Z'),
    lastDeliveredAt: new Date('2026-08-10T16:00:12Z'),
    deliveries: { pending: 1, processing: 0, completed: 1, failed: 0 },
  });
});
