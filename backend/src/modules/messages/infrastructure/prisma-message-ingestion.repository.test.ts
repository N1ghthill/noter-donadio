import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaMessageIngestionRepository } from './prisma-message-ingestion.repository.js';

test('mídia externa persiste referência e solicitação de download atomicamente', async (context) => {
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
  const manualContact = await prisma.contact.create({
    data: {
      workspaceId,
      phoneNumber: '5571000000202',
      displayName: 'Contato manual sintético',
      source: 'manual',
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
      durationSeconds: 8,
      encryptedProviderReference: {
        encryptedData: Buffer.from('ciphertext-synthetic'),
        iv: Buffer.alloc(12, 1),
        authTag: Buffer.alloc(16, 2),
        encryptionKeyVersion: 1,
      },
    },
  });
  assert.equal(result.contactId, manualContact.id);
  assert.equal((await prisma.contact.findUniqueOrThrow({
    where: { id: manualContact.id },
  })).jid, '5571000000202@s.whatsapp.net');

  const asset = await prisma.mediaAsset.findUniqueOrThrow({
    where: { messageId: result.messageId },
  });
  assert.equal(asset.externalMediaId, 'media-external-synthetic');
  assert.equal(asset.downloadState, 'pending');
  assert.equal(asset.storageKey, null);
  assert.equal(asset.transcriptionState, 'pending');
  assert.equal(asset.durationSeconds, 8);
  assert.deepEqual(
    Buffer.from(asset.encryptedProviderReference ?? []),
    Buffer.from('ciphertext-synthetic'),
  );
  assert.deepEqual(Buffer.from(asset.providerReferenceIv ?? []), Buffer.alloc(12, 1));
  assert.deepEqual(Buffer.from(asset.providerReferenceAuthTag ?? []), Buffer.alloc(16, 2));
  assert.equal(asset.providerReferenceKeyVersion, 1);

  const events = await prisma.outboxEvent.findMany({
    where: { aggregateId: result.messageId },
    orderBy: { eventType: 'asc' },
    select: { eventType: true, payload: true },
  });
  assert.deepEqual(events, [
    {
      eventType: 'message.media.download_requested',
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

  const image = await new PrismaMessageIngestionRepository(prisma).persist({
    workspaceId,
    whatsappAccountId: accountId,
    externalMessageId: 'wamid.external-image-synthetic',
    remoteJid: '5571000000202@s.whatsapp.net',
    phoneNumber: '5571000000202',
    direction: 'outbound',
    messageType: 'image',
    content: 'Imagem fictícia do projeto',
    occurredAt: new Date('2026-07-28T07:01:00Z'),
    pendingMedia: {
      externalMediaId: 'image-external-synthetic',
      mimeType: 'image/jpeg',
      originalFileName: 'projeto-ficticio.jpg',
      encryptedProviderReference: {
        encryptedData: Buffer.from('ciphertext-image-synthetic'),
        iv: Buffer.alloc(12, 3),
        authTag: Buffer.alloc(16, 4),
        encryptionKeyVersion: 1,
      },
    },
  });
  const imageAsset = await prisma.mediaAsset.findUniqueOrThrow({
    where: { messageId: image.messageId },
  });
  assert.equal(imageAsset.originalFileName, 'projeto-ficticio.jpg');
  assert.equal(imageAsset.transcriptionState, 'completed');
  assert.equal(await prisma.outboxEvent.count({
    where: {
      aggregateId: image.messageId,
      eventType: 'message.media.download_requested',
    },
  }), 1);
});
