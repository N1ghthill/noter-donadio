import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaInboundMessageNotificationRepository } from './prisma-inbound-message-notification.repository.js';

test('deduplica entrega e filtra direção e corte antes de criar estado', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `notification-${workspaceId}`,
      name: 'Workspace fictício',
      whatsappAccounts: { create: { id: accountId, identifier: `account-${accountId}` } },
      contacts: {
        create: {
          id: contactId,
          phoneNumber: '5571000000505',
          displayName: 'Contato fictício',
          source: 'manual',
        },
      },
    },
  });
  await prisma.negotiation.create({
    data: { id: negotiationId, workspaceId, contactId, title: 'Caso fictício' },
  });
  const eligibleMessageId = randomUUID();
  const outboundMessageId = randomUUID();
  const oldMessageId = randomUUID();
  const failedAnalysisMessageId = randomUUID();
  const analyzedBeforeReceiptMessageId = randomUUID();
  await prisma.message.createMany({
    data: [
      message(eligibleMessageId, 'eligible', 'inbound', '2026-08-10T15:01:00Z'),
      message(outboundMessageId, 'outbound', 'outbound', '2026-08-10T15:02:00Z'),
      message(oldMessageId, 'old', 'inbound', '2026-08-10T14:59:00Z'),
      message(failedAnalysisMessageId, 'failed-analysis', 'inbound', '2026-08-10T15:03:00Z'),
      message(analyzedBeforeReceiptMessageId, 'analyzed-first', 'inbound', '2026-08-10T15:03:30Z'),
    ],
  });

  const repository = new PrismaInboundMessageNotificationRepository(prisma);
  const firstClaim = await repository.claim(claimInput(eligibleMessageId));
  assert.equal(firstClaim.status, 'claimed');
  assert.equal((await repository.claim(claimInput(eligibleMessageId))).status, 'busy');
  if (firstClaim.status === 'claimed') {
    assert.equal(await repository.complete(firstClaim.target, new Date('2026-08-10T15:04:00Z')), true);
  }
  assert.equal((await repository.claim(claimInput(eligibleMessageId))).status, 'completed');
  assert.equal((await repository.claim(claimInput(outboundMessageId))).status, 'ineligible');
  assert.equal((await repository.claim(claimInput(oldMessageId))).status, 'ineligible');
  await prisma.aiAnalysis.create({
    data: {
      workspaceId,
      messageId: eligibleMessageId,
      negotiationId,
      state: 'completed',
      promptVersion: 'message-context-v2',
      conversationContext: { interactionType: 'new_lead' },
    },
  });
  const analysisClaim = await repository.claim({
    ...claimInput(eligibleMessageId),
    milestone: 'analysis_completed',
  });
  assert.equal(analysisClaim.status, 'claimed');
  if (analysisClaim.status === 'claimed') {
    assert.equal(analysisClaim.target.variant, 'new_lead_identified');
    await repository.complete(analysisClaim.target, new Date('2026-08-10T15:05:00Z'));
  }
  assert.equal((await repository.claim({
    ...claimInput(eligibleMessageId),
    milestone: 'analysis_attention',
  })).status, 'ineligible');
  await prisma.aiAnalysis.create({
    data: {
      workspaceId,
      messageId: failedAnalysisMessageId,
      negotiationId,
      state: 'failed',
      promptVersion: 'message-context-v2',
      failureCode: 'ANALYSIS_TEST_FAILURE',
    },
  });
  const attentionClaim = await repository.claim({
    ...claimInput(failedAnalysisMessageId),
    milestone: 'analysis_attention',
  });
  assert.equal(attentionClaim.status, 'claimed');
  if (attentionClaim.status === 'claimed') {
    assert.equal(attentionClaim.target.variant, 'analysis_attention');
  }
  await prisma.aiAnalysis.create({
    data: {
      workspaceId,
      messageId: analyzedBeforeReceiptMessageId,
      negotiationId,
      state: 'completed',
      promptVersion: 'message-context-v2',
      conversationContext: { interactionType: 'continuation' },
    },
  });
  const analyzedFirstClaim = await repository.claim({
    ...claimInput(analyzedBeforeReceiptMessageId),
    milestone: 'analysis_completed',
  });
  assert.equal(analyzedFirstClaim.status, 'claimed');
  if (analyzedFirstClaim.status === 'claimed') {
    await repository.complete(analyzedFirstClaim.target, new Date('2026-08-10T15:06:00Z'));
  }
  assert.equal(
    (await repository.claim(claimInput(analyzedBeforeReceiptMessageId))).status,
    'ineligible',
  );
  assert.equal(await prisma.notificationDelivery.count({ where: { workspaceId } }), 4);

  function message(
    id: string,
    externalMessageId: string,
    direction: 'inbound' | 'outbound',
    occurredAt: string,
  ) {
    return {
      id,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId,
      contactId,
      negotiationId,
      direction,
      messageType: 'text' as const,
      content: 'Mensagem sintética para teste.',
      occurredAt: new Date(occurredAt),
    };
  }

  function claimInput(messageId: string) {
    return {
      workspaceId,
      messageId,
      attemptId: randomUUID(),
      now: new Date('2026-08-10T15:03:00Z'),
      staleBefore: new Date('2026-08-10T14:58:00Z'),
      notBefore: new Date('2026-08-10T15:00:00Z'),
      milestone: 'message_received' as const,
    };
  }
});
