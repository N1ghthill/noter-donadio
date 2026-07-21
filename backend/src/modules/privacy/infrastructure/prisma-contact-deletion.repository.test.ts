import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { ContactDeletionService } from '../domain/contact-deletion.js';
import { PrismaContactDeletionRepository } from './prisma-contact-deletion.repository.js';

test('exclusão remove o agregado, preserva auditoria minimizada e apaga mídia', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  context.after(async () => {
    await prisma.auditEvent.deleteMany({ where: { workspaceId } });
    await prisma.outboxEvent.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  const userId = randomUUID();
  const contactId = randomUUID();
  const accountId = randomUUID();
  const negotiationId = randomUUID();
  const messageId = randomUUID();
  const clientMessageId = randomUUID();
  const storageKey = `${workspaceId}/${clientMessageId}.wav`;
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `privacy-${workspaceId}`,
      name: 'Workspace fictício de privacidade',
      users: { create: {
        id: userId,
        email: `admin-${workspaceId}@example.test`,
        displayName: 'Administrador fictício',
        passwordHash: 'hash-ficticio-nao-utilizavel',
      } },
      contacts: { create: {
        id: contactId,
        displayName: 'Contato fictício a excluir',
        phoneNumber: '5571000000000',
        source: 'manual',
      } },
      whatsappAccounts: { create: { id: accountId, identifier: `fake-${workspaceId}` } },
    },
  });
  await prisma.negotiation.create({ data: { id: negotiationId, workspaceId, contactId } });
  await prisma.message.create({
    data: {
      id: messageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: `fake-${messageId}`,
      contactId,
      negotiationId,
      direction: 'inbound',
      messageType: 'audio',
      occurredAt: new Date('2026-07-21T08:00:00.000Z'),
      mediaAsset: { create: {
        storageKey,
        fileSizeBytes: 16_044,
        durationSeconds: 1,
        mimeType: 'audio/wav',
        retentionUntil: new Date('2026-08-20T08:00:00.000Z'),
      } },
    },
  });

  const repository = new PrismaContactDeletionRepository(prisma);
  const service = new ContactDeletionService(repository, {
    async delete() { throw new Error('filesystem_indisponivel'); },
  });
  const first = await service.deleteContact({ workspaceId, userId, contactId });
  const replay = await service.deleteContact({ workspaceId, userId, contactId });

  assert.deepEqual(first, { deleted: true, completedMedia: 0, pendingMedia: 1 });
  assert.deepEqual(replay, { deleted: false, completedMedia: 0, pendingMedia: 0 });
  assert.equal(await prisma.contact.count({ where: { id: contactId } }), 0);
  assert.equal(await prisma.negotiation.count({ where: { id: negotiationId } }), 0);
  assert.equal(await prisma.message.count({ where: { id: messageId } }), 0);
  assert.equal(await prisma.mediaAsset.count({ where: { messageId } }), 0);
  assert.equal(await prisma.mediaDeletionTask.count({ where: { workspaceId } }), 1);
  const audit = await prisma.auditEvent.findFirstOrThrow({ where: { workspaceId, action: 'contact_deleted' } });
  assert.equal(audit.contactId, null);
  assert.equal(JSON.stringify(audit).includes('Contato fictício'), false);
  assert.equal(JSON.stringify(audit).includes('5571000000000'), false);
  assert.equal(await prisma.outboxEvent.count({
    where: { workspaceId, eventType: 'contact.deleted', aggregateId: contactId },
  }), 1);

  const removedKeys: string[] = [];
  const recovery = new ContactDeletionService(repository, {
    async delete(key) { removedKeys.push(key); },
  });
  assert.deepEqual(await recovery.flushPendingMedia(), {
    selected: 1, completedMedia: 1, pendingMedia: 0,
  });
  assert.deepEqual(removedKeys, [storageKey]);
  assert.equal(await prisma.mediaDeletionTask.count({ where: { workspaceId } }), 0);
});
