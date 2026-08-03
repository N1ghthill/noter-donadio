import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaMessageAnalysisRepository } from './prisma-message-analysis.repository.js';

test('monta contexto limitado de contato existente com várias negociações', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const firstNegotiationId = randomUUID();
  const secondNegotiationId = randomUUID();
  const currentMessageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `analysis-context-${workspaceId}`,
      name: 'Workspace fictício',
      whatsappAccounts: {
        create: { id: accountId, identifier: `account-${accountId}` },
      },
      contacts: {
        create: {
          id: contactId,
          phoneNumber: '5571000000404',
          displayName: 'Contato fictício',
          source: 'manual',
        },
      },
    },
  });
  await prisma.negotiation.createMany({
    data: [
      {
        id: firstNegotiationId,
        workspaceId,
        contactId,
        title: 'Projeto Aurora',
        stage: 'proposal_sent',
        productInterest: 'Implantação Aurora',
        nextAction: 'Aguardar avaliação da proposta',
      },
      {
        id: secondNegotiationId,
        workspaceId,
        contactId,
        title: 'Projeto Boreal',
        stage: 'qualified',
        productInterest: 'Diagnóstico Boreal',
      },
    ],
  });
  await prisma.message.create({
    data: {
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: 'previous-synthetic',
      contactId,
      negotiationId: firstNegotiationId,
      direction: 'outbound',
      messageType: 'text',
      content: 'Proposta sintética enviada para avaliação.',
      occurredAt: new Date('2026-08-03T10:00:00Z'),
    },
  });
  await prisma.message.create({
    data: {
      id: currentMessageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: 'current-synthetic',
      contactId,
      negotiationId: secondNegotiationId,
      direction: 'inbound',
      messageType: 'text',
      content: 'Mensagem sintética sobre dois projetos.',
      occurredAt: new Date('2026-08-03T11:00:00Z'),
    },
  });

  const claim = await new PrismaMessageAnalysisRepository(prisma).claim({
    workspaceId,
    messageId: currentMessageId,
    analysisType: 'message_extraction',
    promptVersion: 'message-context-v2',
    attemptId: randomUUID(),
    now: new Date('2026-08-03T11:01:00Z'),
    staleBefore: new Date('2026-08-03T10:56:00Z'),
    notBefore: null,
  });

  assert.equal(claim.status, 'claimed');
  if (claim.status !== 'claimed') return;
  assert.equal(claim.target.context.sender, 'contact');
  assert.equal(claim.target.context.contactRecognition, 'existing');
  assert.equal(claim.target.context.activeNegotiationCount, 2);
  assert.equal(claim.target.context.candidates.length, 2);
  assert.ok(claim.target.context.provisionalCaseReference);
  assert.deepEqual(
    new Set(claim.target.context.candidates.map((candidate) => candidate.negotiationId)),
    new Set([firstNegotiationId, secondNegotiationId]),
  );
  assert.deepEqual(claim.target.context.recentMessages.map((message) => message.direction), ['outbound']);
  assert.ok(claim.target.context.recentMessages[0]?.caseReference);
});
