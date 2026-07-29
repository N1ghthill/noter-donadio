import assert from 'node:assert/strict';
import test from 'node:test';

import { readBaileysEnvironment } from './baileys-env.js';

const required = {
  DATABASE_URL: 'postgresql://noter:noter@127.0.0.1:5432/noter',
  REDIS_URL: 'redis://127.0.0.1:6379',
  BAILEYS_WORKSPACE_ID: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  BAILEYS_ACCOUNT_ID: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
  BAILEYS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
};

test('carrega identidade vinculada e chave exclusiva do processo Baileys', () => {
  const environment = readBaileysEnvironment(required);
  assert.equal(environment.BAILEYS_WORKSPACE_ID, required.BAILEYS_WORKSPACE_ID);
  assert.equal(environment.BAILEYS_ACCOUNT_ID, required.BAILEYS_ACCOUNT_ID);
  assert.deepEqual(environment.BAILEYS_ENCRYPTION_KEY, Buffer.alloc(32, 3));
  assert.equal(environment.BAILEYS_ENCRYPTION_KEY_VERSION, 1);
  assert.deepEqual(environment.BAILEYS_PROTOCOL_VERSION, [2, 3000, 1_043_857_760]);
});

test('falha fechada sem binding ou com chave inválida', () => {
  assert.throws(() => readBaileysEnvironment({
    DATABASE_URL: required.DATABASE_URL,
    BAILEYS_ENCRYPTION_KEY: required.BAILEYS_ENCRYPTION_KEY,
  }));
  assert.throws(() => readBaileysEnvironment({
    ...required,
    BAILEYS_ENCRYPTION_KEY: 'não-é-chave',
  }));
  assert.throws(() => readBaileysEnvironment({
    ...required,
    BAILEYS_PROTOCOL_VERSION: 'latest',
  }));
});
