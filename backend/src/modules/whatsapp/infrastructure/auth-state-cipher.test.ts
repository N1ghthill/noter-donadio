import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuthStateCipher,
  InvalidAuthStateCiphertextError,
  InvalidAuthStateKeyError,
  parseBase64EncryptionKey,
} from './auth-state-cipher.js';

const KEY_V1 = Buffer.alloc(32, 1);
const KEY_V2 = Buffer.alloc(32, 2);

test('criptografa auth state com AES-256-GCM e AAD vinculada à conta', () => {
  const cipher = new AuthStateCipher(new Map([[1, KEY_V1]]), 1);
  const encrypted = cipher.encrypt(Buffer.from('credencial sintética'), 'workspace:account:creds:state');

  assert.notDeepEqual(encrypted.encryptedData, Buffer.from('credencial sintética'));
  assert.equal(encrypted.iv.byteLength, 12);
  assert.equal(encrypted.authTag.byteLength, 16);
  assert.equal(
    cipher.decrypt(encrypted, 'workspace:account:creds:state').toString('utf8'),
    'credencial sintética',
  );
  assert.throws(
    () => cipher.decrypt(encrypted, 'workspace:outra-conta:creds:state'),
    InvalidAuthStateCiphertextError,
  );
});

test('lê versão antiga durante rotação e grava apenas com a versão ativa', () => {
  const oldCipher = new AuthStateCipher(new Map([[1, KEY_V1]]), 1);
  const encryptedWithV1 = oldCipher.encrypt(Buffer.from('estado sintético'), 'aad');
  const rotatingCipher = new AuthStateCipher(new Map([[1, KEY_V1], [2, KEY_V2]]), 2);

  assert.equal(rotatingCipher.decrypt(encryptedWithV1, 'aad').toString(), 'estado sintético');
  assert.equal(rotatingCipher.encrypt(Buffer.from('novo estado'), 'aad').encryptionKeyVersion, 2);
});

test('aceita somente chave base64 canônica de 32 bytes', () => {
  const encoded = KEY_V1.toString('base64');
  assert.deepEqual(parseBase64EncryptionKey(encoded), KEY_V1);
  assert.throws(() => parseBase64EncryptionKey('segredo-curto'), InvalidAuthStateKeyError);
});
