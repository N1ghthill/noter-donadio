import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPrismaClient } from '../../../config/database.js';
import { AuthStateCipher } from './auth-state-cipher.js';
import {
  BaileysAccountBindingNotFoundError,
  PrismaBaileysAuthStateRepository,
} from './prisma-baileys-auth-state.repository.js';

test('persiste credenciais e Signal keys criptografadas e isoladas por workspace', async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste de integração');
  const prisma = createPrismaClient(databaseUrl);
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const accountId = randomUUID();
  context.after(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await prisma.$disconnect();
  });
  await prisma.workspace.createMany({
    data: [
      { id: workspaceId, slug: `baileys-auth-${workspaceId}`, name: 'Workspace sintético' },
      { id: otherWorkspaceId, slug: `baileys-auth-${otherWorkspaceId}`, name: 'Outro workspace sintético' },
    ],
  });
  await prisma.whatsappAccount.create({
    data: {
      id: accountId,
      workspaceId,
      identifier: 'primary',
    },
  });

  const repository = new PrismaBaileysAuthStateRepository(
    prisma,
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 7)]]), 1),
  );
  const binding = { workspaceId, accountId };
  const auth = await repository.load(binding);
  auth.state.creds.registered = true;
  await auth.saveCreds();
  await auth.state.keys.set({
    'pre-key': {
      'synthetic-key': {
        public: Uint8Array.from([1, 2, 3]),
        private: Uint8Array.from([4, 5, 6]),
      },
    },
  });

  const raw = await prisma.whatsappAuthKey.findMany({
    where: { workspaceId, accountId },
    orderBy: [{ category: 'asc' }, { keyId: 'asc' }],
  });
  assert.equal(raw.length, 2);
  assert.ok(raw.every((record) => record.encryptedData.byteLength > 0));
  assert.ok(raw.every((record) => (
    !Buffer.from(record.encryptedData).toString('utf8').includes('synthetic-key')
  )));

  const reloaded = await repository.load(binding);
  assert.equal(reloaded.state.creds.registered, true);
  const keys = await reloaded.state.keys.get('pre-key', ['synthetic-key', 'missing']);
  assert.deepEqual(keys['synthetic-key']?.public, Buffer.from([1, 2, 3]));
  assert.equal(keys.missing, undefined);

  await reloaded.state.keys.set({ 'pre-key': { 'synthetic-key': null } });
  assert.deepEqual(await reloaded.state.keys.get('pre-key', ['synthetic-key']), {});

  await assert.rejects(
    repository.load({ workspaceId: otherWorkspaceId, accountId }),
    BaileysAccountBindingNotFoundError,
  );
});
