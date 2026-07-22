import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { readEnvironment } from '../../../config/env.js';
import { createPrismaClient } from '../../../config/database.js';
import { PrismaWorkspaceExportRepository } from './prisma-workspace-export.repository.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);

test.after(async () => prisma.$disconnect());

test('exporta dados do workspace e exclui credenciais e chaves internas', async (context) => {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  const contactId = randomUUID();
  const negotiationId = randomUUID();
  const messageId = randomUUID();
  context.after(async () => { await prisma.workspace.deleteMany({ where: { id: workspaceId } }); });

  await prisma.workspace.create({
    data: {
      id: workspaceId, slug: `export-${workspaceId}`, name: 'Workspace fictício',
      users: { create: {
        id: userId, email: 'admin@example.invalid', displayName: 'Admin fictício',
        passwordHash: 'SEGREDO_HASH_NAO_EXPORTAR',
      } },
      whatsappAccounts: { create: {
        id: accountId, identifier: 'conta-ficticia', phoneNumber: '5571000000000',
        authKeys: { create: {
          category: 'session', keyId: 'key-1', encryptedData: Buffer.from('SEGREDO_CRIPTOGRAFADO'),
          iv: Buffer.alloc(12), authTag: Buffer.alloc(16),
        } },
      } },
      contacts: { create: {
        id: contactId, phoneNumber: '5571999999999', displayName: 'Contato fictício',
        source: 'manual', notes: 'Observação autorizada para exportação',
      } },
    },
  });
  await prisma.session.create({ data: {
    workspaceId, userId, tokenHash: 'a'.repeat(64), expiresAt: new Date('2026-07-22T12:00:00.000Z'),
  } });
  await prisma.negotiation.create({ data: {
    id: negotiationId, workspaceId, contactId, title: 'Negociação fictícia', value: '1200.50',
  } });
  await prisma.message.create({ data: {
    id: messageId, workspaceId, whatsappAccountId: accountId, contactId, negotiationId,
    externalMessageId: 'mensagem-ficticia', direction: 'inbound', messageType: 'audio',
    occurredAt: new Date('2026-07-21T10:00:00.000Z'), content: null,
    mediaAsset: { create: {
      storageKey: `${workspaceId}/SEGREDO_STORAGE_KEY.wav`, fileSizeBytes: 16044,
      transcriptionState: 'completed', transcriptionText: 'Transcrição fictícia.',
    } },
  } });

  const exportedAt = new Date('2026-07-21T12:00:00.000Z');
  const document = await new PrismaWorkspaceExportRepository(prisma).exportWorkspace({
    workspaceId, userId, exportedAt,
  });
  assert.ok(document);
  assert.equal(document.exportedAt, exportedAt.toISOString());
  const serialized = JSON.stringify(document);
  assert.match(serialized, /Contato fictício/);
  assert.match(serialized, /Transcrição fictícia/);
  assert.match(serialized, /"value":"1200.5"/);
  assert.doesNotMatch(serialized, /SEGREDO_HASH_NAO_EXPORTAR/);
  assert.doesNotMatch(serialized, /SEGREDO_CRIPTOGRAFADO/);
  assert.doesNotMatch(serialized, /SEGREDO_STORAGE_KEY/);
  assert.doesNotMatch(serialized, /"tokenHash"/);
  assert.equal(await prisma.auditEvent.count({ where: { workspaceId, action: 'workspace_exported' } }), 1);
});

test('não exporta outro workspace quando o identificador não existe', async () => {
  const result = await new PrismaWorkspaceExportRepository(prisma).exportWorkspace({
    workspaceId: randomUUID(), userId: randomUUID(), exportedAt: new Date(),
  });
  assert.equal(result, null);
});
