import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaContactFileRepository } from './prisma-contact-file.repository.js';

test('lista somente arquivos acessíveis do contato e não expõe a chave privada', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const messageId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `contact-files-${workspaceId}`,
      name: 'Workspace sintético',
      whatsappAccounts: { create: { id: accountId, identifier: 'primary' } },
      contacts: {
        create: {
          id: contactId,
          displayName: 'Contato com arquivo',
          phoneNumber: '5571000000002',
        },
      },
    },
  });
  await prisma.message.create({
    data: {
      id: messageId,
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId: 'audio-synthetic',
      contactId,
      direction: 'inbound',
      messageType: 'audio',
      occurredAt: new Date('2026-07-29T12:00:00.000Z'),
      mediaAsset: {
        create: {
          storageKey: `${workspaceId}/private/audio.ogg`,
          mimeType: 'audio/ogg',
          fileSizeBytes: 1024,
          durationSeconds: 3,
          transcriptionState: 'pending',
          retentionUntil: new Date('2026-08-29T12:00:00.000Z'),
        },
      },
    },
  });

  const result = await new PrismaContactFileRepository(prisma).list({
    workspaceId,
    contactId,
    search: 'arquivo',
    limit: 20,
    now: new Date('2026-07-29T13:00:00.000Z'),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.messageId, messageId);
  assert.equal(result[0]?.contactName, 'Contato com arquivo');
  assert.equal(result[0]?.fileSizeBytes, '1024');
  assert.doesNotMatch(JSON.stringify(result), /storageKey|private/);
});
