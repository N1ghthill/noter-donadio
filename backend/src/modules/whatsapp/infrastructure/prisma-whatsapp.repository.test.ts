import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { WhatsappAlreadyConnectedError } from '../domain/whatsapp-connection.js';
import { PrismaWhatsappConnectionRepository } from './prisma-whatsapp.repository.js';

test('reset de autenticação é atômico, isolado e auditado', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `whatsapp-reset-${workspaceId}`,
      name: 'Workspace sintético',
      users: {
        create: {
          id: userId,
          email: 'admin@example.invalid',
          displayName: 'Admin fictício',
          passwordHash: 'hash-ficticio',
        },
      },
      whatsappAccounts: {
        create: {
          id: accountId,
          identifier: 'primary',
          phoneNumber: '5571000000001',
          connectionStatus: 'connected',
          authKeys: {
            create: {
              category: 'creds',
              keyId: 'state',
              encryptedData: Buffer.from('credencial-cifrada-ficticia'),
              iv: Buffer.alloc(12),
              authTag: Buffer.alloc(16),
            },
          },
        },
      },
    },
  });

  const repository = new PrismaWhatsappConnectionRepository(prisma);
  await assert.rejects(
    repository.resetAuthentication(workspaceId, accountId, userId),
    WhatsappAlreadyConnectedError,
  );
  assert.equal(await prisma.whatsappAuthKey.count({ where: { workspaceId, accountId } }), 1);
  assert.equal(await prisma.auditEvent.count({ where: { workspaceId } }), 0);

  await prisma.whatsappAccount.update({
    where: { workspaceId_id: { workspaceId, id: accountId } },
    data: { connectionStatus: 'disconnected' },
  });
  const result = await repository.resetAuthentication(workspaceId, accountId, userId);

  assert.equal(result.status, 'disconnected');
  assert.equal(result.phoneNumber, null);
  assert.equal(await prisma.whatsappAuthKey.count({ where: { workspaceId, accountId } }), 0);
  const audit = await prisma.auditEvent.findFirstOrThrow({
    where: { workspaceId, action: 'whatsapp_auth_reset' },
  });
  assert.equal(audit.userId, userId);
  assert.deepEqual(audit.changedFields, ['whatsappAuthentication', 'phoneNumber']);
  assert.deepEqual(audit.details, {});
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { workspaceId, aggregateId: accountId, eventType: 'whatsapp.connection.changed' },
  });
  assert.deepEqual(event.payload, { workspaceId, accountId, status: 'disconnected' });
});
