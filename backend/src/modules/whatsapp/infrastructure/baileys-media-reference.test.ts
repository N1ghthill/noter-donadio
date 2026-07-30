import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthStateCipher, InvalidAuthStateCiphertextError } from './auth-state-cipher.js';
import { BaileysMediaReferenceCipher } from './baileys-media-reference.js';

const binding = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  accountId: '20000000-0000-4000-8000-000000000002',
  externalMessageId: 'synthetic-audio-message',
};

test('persiste referência mínima de áudio Baileys cifrada e vinculada à mensagem', () => {
  const mediaCipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 7)]]), 1),
  );
  const reference = mediaCipher.fromAudioMessage({
    url: 'https://media.invalid.example.test/file',
    directPath: '/synthetic/path',
    mediaKey: Buffer.alloc(32, 9),
    mimetype: 'audio/ogg',
    seconds: 5,
  });
  assert.ok(reference);

  const encrypted = mediaCipher.encrypt(reference, binding);
  assert.equal(
    Buffer.from(encrypted.encryptedData).indexOf(Buffer.from('synthetic/path')),
    -1,
  );
  assert.deepEqual(mediaCipher.decrypt(encrypted, binding), reference);
  assert.throws(
    () => mediaCipher.decrypt(encrypted, { ...binding, externalMessageId: 'other-message' }),
    InvalidAuthStateCiphertextError,
  );
});

test('preserva o JID técnico original somente dentro da referência cifrada', () => {
  const mediaCipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 7)]]), 1),
  );
  const reference = {
    directPath: '/synthetic/path',
    mediaKey: Buffer.alloc(32, 9),
    retryRemoteJid: '123456789012345@lid',
  };
  const encrypted = mediaCipher.encrypt(reference, binding);

  assert.equal(
    Buffer.from(encrypted.encryptedData).indexOf(Buffer.from(reference.retryRemoteJid)),
    -1,
  );
  assert.deepEqual(mediaCipher.decrypt(encrypted, binding), reference);
});

test('recusa referência de mídia sem chave ou localização', () => {
  const mediaCipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 7)]]), 1),
  );
  assert.equal(mediaCipher.fromAudioMessage({ mediaKey: Buffer.alloc(32, 1) }), null);
  assert.equal(mediaCipher.fromAudioMessage({ directPath: '/path' }), null);
});
