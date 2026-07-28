import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaMessageIngestionRepository } from './prisma-message-ingestion.repository.js';

test('áudio externo persiste referência e solicitação de download atomicamente', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `ingestion-${workspaceId}`,
      name: 'Workspace fictício',
      whatsappAccounts: {
        create: {
          id: accountId,
          identifier: `ingestion-${accountId}`,
          connectionStatus: 'connected',
        },
      },
    },
  });

  const result = await new PrismaMessageIngestionRepository(prisma).persist({
    workspaceId,
    whatsappAccountId: accountId,
    externalMessageId: 'wamid.external-audio-synthetic',
    remoteJid: '5571000000202@s.whatsapp.net',
    phoneNumber: '5571000000202',
    direction: 'inbound',
    messageType: 'audio',
    occurredAt: new Date('2026-07-28T07:00:00Z'),
    pendingMedia: {
      externalMediaId: 'media-external-synthetic',
      mimeType: 'audio/ogg',
    },
  });

  const asset = await prisma.mediaAsset.findUniqueOrThrow({
    where: { messageId: result.messageId },
  });
  assert.equal(asset.externalMediaId, 'media-external-synthetic');
  assert.equal(asset.downloadState, 'pending');
  assert.equal(asset.storageKey, null);
  assert.equal(asset.transcriptionState, 'pending');

  const events = await prisma.outboxEvent.findMany({
    where: { aggregateId: result.messageId },
    orderBy: { eventType: 'asc' },
    select: { eventType: true, payload: true },
  });
  assert.deepEqual(events, [
    {
      eventType: 'message.audio.download_requested',
      payload: {
        messageId: result.messageId,
        workspaceId,
        negotiationId: result.negotiationId,
      },
    },
    {
      eventType: 'message.persisted',
      payload: {
        messageId: result.messageId,
        workspaceId,
        contactId: result.contactId,
        negotiationId: result.negotiationId,
      },
    },
  ]);
});
