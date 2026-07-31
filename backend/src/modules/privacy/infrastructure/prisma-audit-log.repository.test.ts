import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { readEnvironment } from '../../../config/env.js';
import { createPrismaClient } from '../../../config/database.js';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);

test.after(async () => prisma.$disconnect());

test('lista somente auditorias do workspace e sanitiza detalhes', async (context) => {
  const firstWorkspaceId = randomUUID();
  const secondWorkspaceId = randomUUID();
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [firstWorkspaceId, secondWorkspaceId] } } });
  });

  await prisma.workspace.create({ data: {
    id: firstWorkspaceId, slug: `audit-${firstWorkspaceId}`, name: 'Primeiro workspace',
    users: { create: {
      id: firstUserId, email: 'first@example.invalid', displayName: 'Primeiro admin', passwordHash: 'hash-ficticio',
    } },
  } });
  await prisma.workspace.create({ data: {
    id: secondWorkspaceId, slug: `audit-${secondWorkspaceId}`, name: 'Segundo workspace',
    users: { create: {
      id: secondUserId, email: 'second@example.invalid', displayName: 'Segundo admin', passwordHash: 'hash-ficticio',
    } },
  } });
  await prisma.auditEvent.createMany({ data: [{
    workspaceId: firstWorkspaceId,
    userId: firstUserId,
    action: 'workspace_exported',
    details: { schemaVersion: 'workspace-export-v1', secret: 'NAO_EXPOR' },
  }, {
    workspaceId: secondWorkspaceId,
    userId: secondUserId,
    action: 'workspace_exported',
    details: { schemaVersion: 'workspace-export-v1' },
  }] });

  const result = await new PrismaAuditLogRepository(prisma).list({
    workspaceId: firstWorkspaceId,
    limit: 10,
    action: 'workspace_exported',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.actorDisplayName, 'Primeiro admin');
  assert.deepEqual(result[0]?.details, { schemaVersion: 'workspace-export-v1' });
  assert.doesNotMatch(JSON.stringify(result), /NAO_EXPOR|Segundo admin/);
});

test('recusa referência de auditoria para contato de outro workspace', async (context) => {
  const firstWorkspaceId = randomUUID();
  const secondWorkspaceId = randomUUID();
  const firstUserId = randomUUID();
  const secondContactId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: [firstWorkspaceId, secondWorkspaceId] } },
    });
  });

  await prisma.workspace.create({
    data: {
      id: firstWorkspaceId,
      slug: `audit-scope-${firstWorkspaceId}`,
      name: 'Primeiro workspace',
      users: { create: {
        id: firstUserId,
        email: `first-${firstWorkspaceId}@example.invalid`,
        displayName: 'Primeiro admin',
        passwordHash: 'hash-ficticio',
      } },
    },
  });
  await prisma.workspace.create({
    data: {
      id: secondWorkspaceId,
      slug: `audit-scope-${secondWorkspaceId}`,
      name: 'Segundo workspace',
      contacts: { create: {
        id: secondContactId,
        phoneNumber: '5571000000042',
        displayName: 'Contato fictício',
        source: 'manual',
      } },
    },
  });

  await assert.rejects(prisma.auditEvent.create({
    data: {
      workspaceId: firstWorkspaceId,
      userId: firstUserId,
      contactId: secondContactId,
      action: 'contact_updated',
    },
  }));
});
