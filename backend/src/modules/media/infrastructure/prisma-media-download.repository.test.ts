import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaMediaDownloadRepository } from './prisma-media-download.repository.js';

test('conclusão do download libera transcrição pela outbox na mesma transação', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  const messageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: { id: workspaceId, slug: `download-${workspaceId}`, name: 'Workspace fictício' },
  });
  await prisma.whatsappAccount.create({
    data: {
      id: accountId,
      workspaceId,
      identifier: 'download-synthetic',
      provider: 'synthetic_provider',
      connectionStatus: 'connected',
    },
  });
  await prisma.contact.create({
    data: {
      id: contactId,
      workspaceId,
      jid: '5571000000201@s.whatsapp.net',
      phoneNumber: '5571000000201',
      displayName: 'Contato fictício',
    },
  });
  await prisma.negotiation.create({
    data: {
      id: negotiationId,
      workspaceId,
      contactId,
      title: 'Negociação fictícia',
    },
  });
  await prisma.message.create({
    data: {
      id: messageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: 'wamid.download-synthetic',
      contactId,
      negotiationId,
      direction: 'inbound',
      messageType: 'audio',
      occurredAt: new Date('2026-07-28T06:00:00Z'),
      mediaAsset: {
        create: {
          externalMediaId: 'media-synthetic',
          mimeType: 'audio/ogg',
          downloadState: 'pending',
          transcriptionState: 'pending',
        },
      },
    },
  });

  const repository = new PrismaMediaDownloadRepository(prisma);
  const attemptId = randomUUID();
  const claim = await repository.claim({
    workspaceId,
    messageId,
    attemptId,
    now: new Date('2026-07-28T06:01:00Z'),
    staleBefore: new Date('2026-07-28T05:56:00Z'),
  });
  assert.equal(claim.status, 'claimed');

  assert.equal(await repository.complete({
    workspaceId,
    messageId,
    attemptId,
    externalMediaId: 'media-synthetic',
    storageKey: `${workspaceId}/${attemptId}.media`,
    fileSizeBytes: 3,
    mimeType: 'audio/ogg',
    durationSeconds: 2,
    retentionUntil: new Date('2026-08-27T06:01:00Z'),
  }), true);

  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { messageId } });
  assert.equal(asset.downloadState, 'completed');
  assert.equal(asset.storageKey, `${workspaceId}/${attemptId}.media`);
  assert.equal(asset.transcriptionState, 'pending');
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateId: messageId, eventType: 'message.audio.ingested' },
  });
  assert.deepEqual(event.payload, { workspaceId, messageId, negotiationId });

  const imageMessageId = randomUUID();
  await prisma.message.create({
    data: {
      id: imageMessageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: 'wamid.image-download-synthetic',
      contactId,
      negotiationId,
      direction: 'outbound',
      messageType: 'image',
      occurredAt: new Date('2026-07-28T06:02:00Z'),
      mediaAsset: {
        create: {
          externalMediaId: 'image-media-synthetic',
          mimeType: 'image/jpeg',
          originalFileName: 'imagem-ficticia.jpg',
          downloadState: 'pending',
          transcriptionState: 'completed',
        },
      },
    },
  });
  const imageAttemptId = randomUUID();
  const imageClaim = await repository.claim({
    workspaceId,
    messageId: imageMessageId,
    attemptId: imageAttemptId,
    now: new Date('2026-07-28T06:03:00Z'),
    staleBefore: new Date('2026-07-28T05:58:00Z'),
  });
  assert.equal(imageClaim.status, 'claimed');
  if (imageClaim.status === 'claimed') assert.equal(imageClaim.target.messageType, 'image');
  assert.equal(await repository.complete({
    workspaceId,
    messageId: imageMessageId,
    attemptId: imageAttemptId,
    externalMediaId: 'image-media-synthetic',
    storageKey: `${workspaceId}/${imageAttemptId}.media`,
    fileSizeBytes: 4,
    mimeType: 'image/jpeg',
    durationSeconds: null,
    retentionUntil: new Date('2026-08-27T06:03:00Z'),
  }), true);
  const imageEvent = await prisma.outboxEvent.findFirstOrThrow({
    where: { aggregateId: imageMessageId, eventType: 'message.media.available' },
  });
  assert.deepEqual(imageEvent.payload, {
    workspaceId,
    messageId: imageMessageId,
    contactId,
    negotiationId,
  });
});
