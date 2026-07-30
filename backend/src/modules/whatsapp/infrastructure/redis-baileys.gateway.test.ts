import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import {
  RedisBaileysControl,
  RedisBaileysGateway,
  RedisBaileysMediaRecoveryGateway,
} from './redis-baileys.gateway.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

test('comando de setup retorna somente QR efêmero produzido pelo processo dedicado', async (context) => {
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const gateway = new RedisBaileysGateway(redisUrl);
  const control = new RedisBaileysControl(redisUrl);
  context.after(async () => {
    await Promise.all([gateway.close(), control.close()]);
  });
  await control.subscribe(async (command) => {
    if (command.workspaceId === workspaceId && command.accountId === accountId) {
      await control.storeQr(workspaceId, accountId, 'qr-sintético-sem-credenciais');
    }
  });

  const qrCode = await gateway.createQrCode(workspaceId, accountId);

  assert.equal(qrCode.payload, 'qr-sintético-sem-credenciais');
  assert.ok(Date.parse(qrCode.expiresAt) > Date.now());
  await control.clearQr(workspaceId, accountId);
  assert.equal(await gateway.currentQrCode(workspaceId, accountId), null);
});

test('recuperação de mídia transporta somente IDs e recebe resultado efêmero', async (context) => {
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const messageId = randomUUID();
  const gateway = new RedisBaileysMediaRecoveryGateway(redisUrl);
  const control = new RedisBaileysControl(redisUrl);
  context.after(async () => {
    await Promise.all([gateway.close(), control.close()]);
  });
  await control.subscribe(async (command) => {
    if (
      command.type === 'recover_media'
      && command.workspaceId === workspaceId
      && command.accountId === accountId
    ) {
      assert.equal(command.messageId, messageId);
      assert.equal(JSON.stringify(command).includes('content'), false);
      await control.completeMediaRecovery(command.requestId, true);
    }
  });

  await gateway.recover({ workspaceId, accountId, messageId });
});
