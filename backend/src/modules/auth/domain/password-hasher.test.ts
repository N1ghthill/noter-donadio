import assert from 'node:assert/strict';
import test from 'node:test';

import { ScryptPasswordHasher } from './password-hasher.js';

const testHasher = new ScryptPasswordHasher({
  N: 2 ** 14,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
});

test('senha é armazenada com salt e verificada em tempo seguro', async () => {
  const encoded = await testHasher.hash('uma-senha-de-teste-comprida');

  assert.equal(encoded.includes('uma-senha-de-teste-comprida'), false);
  assert.equal(await testHasher.verify('uma-senha-de-teste-comprida', encoded), true);
  assert.equal(await testHasher.verify('senha-incorreta-comprida', encoded), false);
});

test('salts individuais produzem hashes diferentes', async () => {
  const first = await testHasher.hash('uma-senha-de-teste-comprida');
  const second = await testHasher.hash('uma-senha-de-teste-comprida');
  assert.notEqual(first, second);
});
