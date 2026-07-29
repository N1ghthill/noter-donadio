import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaConversationRepository } from './prisma-conversation.repository.js';

test('lista conversas por início e expõe classificação mais recente sem aplicar a sugestão', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  const firstMessageId = randomUUID();
  const lastMessageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `conversations-${workspaceId}`,
      name: 'Workspace sintético',
      whatsappAccounts: { create: { id: accountId, identifier: 'primary' } },
      contacts: {
        create: {
          id: contactId,
          displayName: 'Contato de classificação',
          phoneNumber: '5571000000001',
        },
      },
    },
  });
  await prisma.negotiation.create({
    data: {
      id: negotiationId,
      workspaceId,
      contactId,
      title: 'Projeto sintético',
      stage: 'lead',
    },
  });
  await prisma.message.createMany({
    data: [
      {
        id: firstMessageId,
        workspaceId,
        whatsappAccountId: accountId,
        externalMessageId: 'first-synthetic',
        contactId,
        negotiationId,
        direction: 'inbound',
        messageType: 'text',
        content: 'Primeira mensagem sintética.',
        occurredAt: new Date('2026-07-29T10:00:00.000Z'),
      },
      {
        id: lastMessageId,
        workspaceId,
        whatsappAccountId: accountId,
        externalMessageId: 'last-synthetic',
        contactId,
        negotiationId,
        direction: 'outbound',
        messageType: 'text',
        content: 'Última mensagem sintética.',
        occurredAt: new Date('2026-07-29T11:00:00.000Z'),
      },
    ],
  });
  await prisma.aiAnalysis.create({
    data: {
      workspaceId,
      messageId: lastMessageId,
      negotiationId,
      state: 'completed',
      summary: 'Contato solicitou proposta.',
      sentiment: 'positive',
      suggestedStage: 'qualified',
      suggestedTags: ['proposta'],
      promptVersion: 'test-v1',
    },
  });

  const result = await new PrismaConversationRepository(prisma).list(workspaceId, {
    limit: 20,
    startedFrom: new Date('2026-07-29T00:00:00.000Z'),
    startedTo: new Date('2026-07-30T00:00:00.000Z'),
    stage: 'lead',
    aiStage: 'qualified',
    search: 'classificação',
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.messageCount, 2);
  assert.equal(result[0]?.firstMessageAt, '2026-07-29T10:00:00.000Z');
  assert.equal(result[0]?.lastMessage.id, lastMessageId);
  assert.equal(result[0]?.latestAnalysis?.summary, 'Contato solicitou proposta.');
  assert.equal(result[0]?.latestAnalysis?.suggestedStage, 'qualified');
  const persisted = await prisma.negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
  assert.equal(persisted.stage, 'lead');
});
