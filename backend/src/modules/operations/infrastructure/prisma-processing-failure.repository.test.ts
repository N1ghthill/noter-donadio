import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaProcessingFailureRepository } from './prisma-processing-failure.repository.js';

test('retry de análise é isolado, atômico, auditado e não carrega conteúdo na outbox', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const messageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });
  const accountId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  await prisma.workspace.create({
    data: {
      id: workspaceId, slug: `processing-${workspaceId}`, name: 'Workspace sintético',
      users: { create: { id: userId, email: 'admin@example.invalid', displayName: 'Admin fictício', passwordHash: 'hash' } },
      whatsappAccounts: { create: { id: accountId, identifier: 'primary' } },
      contacts: { create: { id: contactId, phoneNumber: '5571000000099', displayName: 'Contato fictício' } },
      negotiations: { create: { id: negotiationId, contactId } },
    },
  });
  await prisma.message.create({
    data: {
      id: messageId, workspaceId, whatsappAccountId: accountId, contactId, negotiationId,
      externalMessageId: `synthetic-${messageId}`, direction: 'inbound', messageType: 'text',
      content: 'Conteúdo sintético que não deve entrar no evento.', occurredAt: new Date(),
      aiAnalyses: { create: {
        negotiationId, state: 'failed', promptVersion: 'message-extraction-v1',
        failureCode: 'ANALYSIS_AUTHENTICATION_FAILED',
      } },
    },
  });

  const repository = new PrismaProcessingFailureRepository(prisma);
  const failures = await repository.list(workspaceId, 10, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.retryEligible, true);
  assert.equal(failures[0]?.contactName, 'Contato fictício');

  assert.equal(await repository.requestRetry({
    workspaceId, userId, kind: 'analysis', messageId,
    notBefore: new Date('2026-01-01T00:00:00.000Z'),
  }), 'queued');
  const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { workspaceId, messageId } });
  assert.equal(analysis.state, 'pending');
  assert.equal(analysis.failureCode, null);
  const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { workspaceId, aggregateId: messageId } });
  assert.equal(outbox.eventType, 'message.text.ingested');
  assert.equal(JSON.stringify(outbox.payload).includes('Conteúdo sintético'), false);
  const audit = await prisma.auditEvent.findFirstOrThrow({
    where: { workspaceId, action: 'processing_retry_requested' },
  });
  assert.equal(audit.userId, userId);
  assert.deepEqual(audit.details, { kind: 'analysis' });
  assert.equal(await repository.requestRetry({
    workspaceId, userId, kind: 'analysis', messageId,
    notBefore: new Date('2026-01-01T00:00:00.000Z'),
  }), 'not_failed');
});
