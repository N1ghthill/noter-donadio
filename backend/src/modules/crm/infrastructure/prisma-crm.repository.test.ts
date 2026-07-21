import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { CrmDecisionConflictError } from '../domain/crm.repository.js';
import { PrismaCrmRepository } from './prisma-crm.repository.js';

test('aceite é atômico, auditável e idempotente no PostgreSQL', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  const userId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  const accountId = randomUUID();
  const messageId = randomUUID();
  const analysisId = randomUUID();
  const decisionId = randomUUID();
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `integration-${workspaceId}`,
      name: 'Workspace fictício de integração',
      users: {
        create: {
          id: userId,
          email: `admin-${workspaceId}@example.test`,
          displayName: 'Administrador fictício',
          passwordHash: 'hash-ficticio-nao-utilizavel',
        },
      },
      contacts: {
        create: {
          id: contactId,
          displayName: 'Contato fictício',
          phoneNumber: '5571000000000',
          source: 'manual',
          tags: ['existente'],
        },
      },
      whatsappAccounts: {
        create: { id: accountId, identifier: `fake-${workspaceId}` },
      },
    },
  });
  await prisma.negotiation.create({
    data: { id: negotiationId, workspaceId, contactId, stage: 'lead' },
  });
  await prisma.message.create({
    data: {
      id: messageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: `fake-${messageId}`,
      contactId,
      negotiationId,
      direction: 'inbound',
      messageType: 'text',
      content: 'Mensagem fictícia para teste de integração.',
      occurredAt: new Date('2026-07-21T06:00:00.000Z'),
    },
  });
  await prisma.aiAnalysis.create({
    data: {
      id: analysisId,
      workspaceId,
      messageId,
      negotiationId,
      state: 'completed',
      promptVersion: 'integration-v1',
      suggestedStage: 'qualified',
      suggestedTags: ['prioridade'],
    },
  });

  const repository = new PrismaCrmRepository(prisma);
  const input = {
    workspaceId,
    userId,
    negotiationId,
    analysisId,
    decisionId,
    decision: 'accepted' as const,
    expectedVersion: 1,
    stage: 'proposal_sent' as const,
    tags: ['prioridade'],
  };
  const first = await repository.decideAnalysis(input);
  const replay = await repository.decideAnalysis(input);

  assert.deepEqual(replay, first);
  assert.equal(first.resultingNegotiationVersion, 2);
  const negotiation = await prisma.negotiation.findUniqueOrThrow({
    where: { id: negotiationId },
    include: { contact: true },
  });
  assert.equal(negotiation.stage, 'proposal_sent');
  assert.equal(negotiation.version, 2);
  assert.deepEqual(negotiation.contact.tags, ['existente', 'prioridade']);
  assert.equal(await prisma.analysisDecision.count({ where: { analysisId } }), 1);
  assert.equal(await prisma.outboxEvent.count({
    where: { eventType: 'analysis.decision.changed', aggregateId: decisionId },
  }), 1);
  await assert.rejects(
    repository.decideAnalysis({
      ...input,
      decisionId: randomUUID(),
      decision: 'ignored',
      stage: undefined,
      tags: undefined,
    }),
    CrmDecisionConflictError,
  );
});
