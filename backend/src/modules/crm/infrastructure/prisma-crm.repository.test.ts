import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { CrmDecisionConflictError } from '../domain/crm.repository.js';
import { PrismaCrmRepository } from './prisma-crm.repository.js';

test('criação manual de negociação é atômica, auditável e isolada por workspace', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  context.after(async () => {
    await prisma.auditEvent.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.$disconnect();
  });

  const userId = randomUUID();
  const contactId = randomUUID();
  const foreignContactId = randomUUID();
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `negotiation-${workspaceId}`,
      name: 'Workspace fictício de negociação',
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
          phoneNumber: '5571000000002',
          source: 'manual',
        },
      },
    },
  });
  await prisma.workspace.create({
    data: {
      id: otherWorkspaceId,
      slug: `foreign-${otherWorkspaceId}`,
      name: 'Outro workspace fictício',
      contacts: {
        create: {
          id: foreignContactId,
          displayName: 'Contato externo fictício',
          phoneNumber: '5571000000003',
          source: 'manual',
        },
      },
    },
  });

  const repository = new PrismaCrmRepository(prisma);
  await assert.rejects(repository.createNegotiation({
    workspaceId,
    userId,
    contactId: foreignContactId,
    stage: 'lead',
    currency: 'BRL',
  }));
  assert.equal(await prisma.negotiation.count({ where: { workspaceId } }), 0);

  const created = await repository.createNegotiation({
    workspaceId,
    userId,
    contactId,
    title: 'Projeto fictício confidencial',
    stage: 'qualified',
    value: '1250.50',
    currency: 'BRL',
    expectedCloseDate: '2026-08-15',
    productInterest: 'Serviço fictício confidencial',
    nextAction: 'Enviar proposta confidencial',
    nextActionDueDate: '2026-08-20',
  });

  assert.equal(created.contactName, 'Contato fictício');
  assert.equal(created.value, '1250.5');
  const negotiation = await prisma.negotiation.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(negotiation.value?.toString(), '1250.5');
  assert.ok(negotiation.valueConfirmedAt);
  assert.equal(negotiation.expectedCloseDate?.toISOString(), '2026-08-15T00:00:00.000Z');
  assert.equal(negotiation.nextAction, 'Enviar proposta confidencial');
  assert.equal(negotiation.nextActionDueDate?.toISOString(), '2026-08-20T00:00:00.000Z');
  assert.ok(negotiation.nextActionConfirmedAt);
  assert.ok(negotiation.nextActionDueDateConfirmedAt);
  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { negotiationId: created.id } });
  assert.equal(audit.action, 'negotiation_created');
  assert.deepEqual(audit.changedFields, [
    'contactId', 'stage', 'title', 'value', 'expectedCloseDate', 'productInterest', 'nextAction', 'nextActionDueDate',
  ]);
  const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: created.id } });
  assert.equal(outbox.eventType, 'negotiation.created');
  const serializedPayload = JSON.stringify(outbox.payload);
  assert.equal(serializedPayload.includes('1250'), false);
  assert.equal(serializedPayload.includes('confidencial'), false);

  await repository.updateNegotiation({
    workspaceId,
    userId,
    negotiationId: created.id,
    expectedVersion: 1,
    title: 'Projeto fictício revisado',
    value: '9800.75',
    expectedCloseDate: null,
    productInterest: 'Serviço revisado confidencial',
    nextAction: 'Ligar para o contato',
    nextActionDueDate: '2020-01-01',
  });
  const revised = await prisma.negotiation.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(revised.version, 2);
  assert.equal(revised.value?.toString(), '9800.75');
  assert.ok(revised.valueConfirmedAt);
  assert.equal(revised.expectedCloseDate, null);
  assert.ok(revised.expectedCloseDateConfirmedAt);
  assert.ok(revised.productInterestConfirmedAt);
  assert.equal(revised.nextAction, 'Ligar para o contato');
  assert.equal(revised.nextActionDueDate?.toISOString(), '2020-01-01T00:00:00.000Z');
  assert.ok(revised.nextActionConfirmedAt);
  assert.ok(revised.nextActionDueDateConfirmedAt);
  const updateAudit = await prisma.auditEvent.findFirstOrThrow({
    where: { negotiationId: created.id, action: 'negotiation_updated' },
  });
  assert.deepEqual(updateAudit.changedFields, [
    'title', 'value', 'expectedCloseDate', 'productInterest', 'nextAction', 'nextActionDueDate',
  ]);
  const updateEvent = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateId: created.id, eventType: 'negotiation.updated' },
  });
  const serializedUpdate = JSON.stringify(updateEvent.payload);
  assert.equal(serializedUpdate.includes('9800'), false);
  assert.equal(serializedUpdate.includes('confidencial'), false);

  const overdue = await repository.listNegotiations(workspaceId, {
    followUp: 'overdue',
    search: 'Ligar',
    limit: 10,
  });
  assert.deepEqual(overdue.map((item) => item.id), [created.id]);
  const dashboard = await repository.getDashboard(workspaceId, 30);
  assert.equal(dashboard.contactsCount, 1);
  assert.equal(dashboard.activeNegotiationsCount, 1);
  assert.equal(dashboard.pipelineValue, '9800.75');
  assert.equal(dashboard.overdueFollowUpsCount, 1);
  assert.equal(dashboard.missingFollowUpsCount, 0);
  assert.deepEqual(dashboard.stages, [{ stage: 'qualified', count: 1, value: '9800.75' }]);

  const completed = await repository.completeNextAction({
    workspaceId,
    userId,
    negotiationId: created.id,
    expectedVersion: 2,
  });
  assert.equal(completed.version, 3);
  assert.equal(completed.nextAction, null);
  assert.equal(completed.nextActionDueDate, null);
  const followUp = await prisma.negotiationFollowUpHistory.findFirstOrThrow({
    where: { negotiationId: created.id },
  });
  assert.equal(followUp.description, 'Ligar para o contato');
  assert.equal(followUp.dueDate?.toISOString(), '2020-01-01T00:00:00.000Z');
  assert.equal(followUp.completedByUserId, userId);
  const completionAudit = await prisma.auditEvent.findFirstOrThrow({
    where: { negotiationId: created.id, action: 'negotiation_follow_up_completed' },
  });
  assert.deepEqual(completionAudit.changedFields, ['nextAction', 'nextActionDueDate']);
  assert.equal(JSON.stringify(completionAudit).includes('Ligar para o contato'), false);

  const closed = await repository.updateNegotiationStage({
    workspaceId,
    userId,
    negotiationId: created.id,
    stage: 'closed_won',
    closeReason: 'Contrato fictício aprovado em teste',
    expectedVersion: 3,
  });
  assert.equal(closed.version, 4);
  const closedRecord = await prisma.negotiation.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(closedRecord.closeReason, 'Contrato fictício aprovado em teste');
  assert.ok(closedRecord.closedAt);
  const stageAudit = await prisma.auditEvent.findFirstOrThrow({
    where: { negotiationId: created.id, action: 'negotiation_stage_changed' },
  });
  assert.deepEqual(stageAudit.changedFields, ['stage', 'closeReason']);
  assert.equal(JSON.stringify(stageAudit).includes('Contrato fictício'), false);
  const stageEvent = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateId: created.id, eventType: 'negotiation.stage.changed' },
  });
  assert.equal(JSON.stringify(stageEvent.payload).includes('Contrato fictício'), false);
});

test('aceite é atômico, auditável e idempotente no PostgreSQL', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  context.after(async () => {
    await prisma.auditEvent.deleteMany({ where: { workspaceId } });
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
  const createdContact = await repository.createContact({
    workspaceId,
    userId,
    displayName: 'Outro contato fictício',
    phoneNumber: '5571000000001',
    tags: [],
    notes: 'Observação fictícia que não pode ser copiada para a auditoria.',
  });
  await repository.updateContact({
    workspaceId,
    userId,
    contactId,
    displayName: 'Contato fictício atualizado',
  });
  await repository.updateNegotiationStage({
    workspaceId,
    userId,
    negotiationId,
    stage: 'qualified',
    expectedVersion: 1,
  });
  const input = {
    workspaceId,
    userId,
    negotiationId,
    analysisId,
    decisionId,
    decision: 'accepted' as const,
    expectedVersion: 2,
    stage: 'proposal_sent' as const,
    tags: ['prioridade'],
    value: '4200.25',
    expectedCloseDate: '2026-09-30',
    productInterest: 'Produto confirmado fictício',
    nextAction: 'Agendar demonstração fictícia',
    nextActionDueDate: '2026-09-15',
  };
  const first = await repository.decideAnalysis(input);
  const replay = await repository.decideAnalysis(input);

  assert.deepEqual(replay, first);
  assert.equal(first.resultingNegotiationVersion, 3);
  const negotiation = await prisma.negotiation.findUniqueOrThrow({
    where: { id: negotiationId },
    include: { contact: true },
  });
  assert.equal(negotiation.stage, 'proposal_sent');
  assert.equal(negotiation.version, 3);
  assert.equal(negotiation.value?.toString(), '4200.25');
  assert.equal(negotiation.expectedCloseDate?.toISOString(), '2026-09-30T00:00:00.000Z');
  assert.equal(negotiation.productInterest, 'Produto confirmado fictício');
  assert.equal(negotiation.nextAction, 'Agendar demonstração fictícia');
  assert.equal(negotiation.nextActionDueDate?.toISOString(), '2026-09-15T00:00:00.000Z');
  assert.ok(negotiation.valueConfirmedAt);
  assert.ok(negotiation.expectedCloseDateConfirmedAt);
  assert.ok(negotiation.productInterestConfirmedAt);
  assert.ok(negotiation.nextActionConfirmedAt);
  assert.ok(negotiation.nextActionDueDateConfirmedAt);
  assert.deepEqual(negotiation.contact.tags, ['existente', 'prioridade']);
  assert.equal(await prisma.analysisDecision.count({ where: { analysisId } }), 1);
  const persistedDecision = await prisma.analysisDecision.findUniqueOrThrow({ where: { analysisId } });
  assert.equal(persistedDecision.appliedValue?.toString(), '4200.25');
  assert.equal(persistedDecision.appliedExpectedCloseDate?.toISOString(), '2026-09-30T00:00:00.000Z');
  assert.equal(persistedDecision.appliedProductInterest, 'Produto confirmado fictício');
  assert.equal(persistedDecision.appliedNextAction, 'Agendar demonstração fictícia');
  assert.equal(persistedDecision.appliedNextActionDueDate?.toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal(await prisma.outboxEvent.count({
    where: { eventType: 'analysis.decision.changed', aggregateId: decisionId },
  }), 1);
  const auditEvents = await prisma.auditEvent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'contact_created',
    'contact_updated',
    'negotiation_stage_changed',
    'analysis_accepted',
  ]);
  assert.equal(auditEvents[0]?.contactId, createdContact.id);
  assert.equal(JSON.stringify(auditEvents).includes('5571000000001'), false);
  assert.equal(JSON.stringify(auditEvents).includes('Observação fictícia'), false);
  const detail = await repository.getNegotiation(workspaceId, negotiationId);
  assert.equal(detail.auditTrail.length, 3);
  assert.equal(detail.auditTrail.every((event) => event.actorDisplayName === 'Administrador fictício'), true);
  const duplicateContactId = randomUUID();
  const duplicateNegotiationId = randomUUID();
  const duplicateMessageId = randomUUID();
  await prisma.contact.create({
    data: {
      id: duplicateContactId,
      workspaceId,
      phoneNumber: '5571000000000',
      displayName: 'Contato duplicado por LID',
      jid: '123456789012345@lid',
    },
  });
  await prisma.negotiation.create({
    data: {
      id: duplicateNegotiationId,
      workspaceId,
      contactId: duplicateContactId,
      stage: 'lead',
    },
  });
  await prisma.message.create({
    data: {
      id: duplicateMessageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: `fake-${duplicateMessageId}`,
      contactId: duplicateContactId,
      negotiationId: duplicateNegotiationId,
      direction: 'inbound',
      messageType: 'audio',
      occurredAt: new Date('2026-07-21T07:00:00.000Z'),
    },
  });
  const contactConversation = await repository.getNegotiation(
    workspaceId,
    negotiationId,
    'contact',
  );
  assert.deepEqual(
    contactConversation.messages.map((message) => message.id),
    [messageId, duplicateMessageId],
  );
  assert.equal(detail.messages.length, 1);
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
