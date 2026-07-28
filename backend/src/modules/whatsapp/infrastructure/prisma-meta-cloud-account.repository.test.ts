import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { PrismaMetaCloudAccountMappingRepository } from './prisma-meta-cloud-account.repository.js';

test('resolve somente WABA, número e conta conectada correspondentes', async (context) => {
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
      slug: `meta-${workspaceId}`,
      name: 'Workspace Meta fictício',
      whatsappAccounts: {
        create: {
          id: accountId,
          identifier: 'meta-synthetic',
          provider: 'meta_cloud_api',
          providerBusinessAccountId: 'waba-synthetic',
          providerPhoneNumberId: 'phone-synthetic',
          connectionStatus: 'connected',
        },
      },
    },
  });

  const repository = new PrismaMetaCloudAccountMappingRepository(prisma);
  assert.deepEqual(
    await repository.resolve('waba-synthetic', 'phone-synthetic'),
    { workspaceId, whatsappAccountId: accountId },
  );
  assert.equal(await repository.resolve('waba-other', 'phone-synthetic'), null);

  await prisma.whatsappAccount.update({
    where: { id: accountId },
    data: { connectionStatus: 'disconnected' },
  });
  assert.equal(await repository.resolve('waba-synthetic', 'phone-synthetic'), null);
});
