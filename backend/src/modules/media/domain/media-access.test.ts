import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidMediaSignatureError, MediaAccessService, MediaNotFoundError } from './media-access.js';
import type { MediaStorage } from './media-storage.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const MESSAGE_ID = '11b3f58b-4f89-47f2-93bc-89be57028a48';
const NOW = new Date('2026-07-21T12:00:00.000Z');
const bytes = Buffer.from('audio-ficticio');

function storage(): MediaStorage {
  return {
    async write() {},
    async read(key) {
      assert.equal(key, `${WORKSPACE_ID}/${MESSAGE_ID}.wav`);
      return bytes;
    },
    async delete() {},
  };
}

function service() {
  return new MediaAccessService({
    async findAccessible(workspaceId, messageId) {
      if (workspaceId !== WORKSPACE_ID || messageId !== MESSAGE_ID) return null;
      return {
        storageKey: `${WORKSPACE_ID}/${MESSAGE_ID}.wav`,
        mimeType: 'audio/wav',
        durationSeconds: 1,
      };
    },
  }, storage(), 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres');
}

test('emite acesso curto e lê a mídia somente com assinatura válida', async () => {
  const media = service();
  const access = await media.createAccess(WORKSPACE_ID, MESSAGE_ID, NOW);
  const url = new URL(access.url, 'http://localhost');
  const result = await media.read(
    WORKSPACE_ID,
    MESSAGE_ID,
    Number(url.searchParams.get('expires')),
    url.searchParams.get('signature') ?? '',
    NOW,
  );

  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(access.expiresAt, '2026-07-21T12:02:00.000Z');
});

test('rejeita assinatura alterada, expirada e mídia de outro workspace', async () => {
  const media = service();
  const access = await media.createAccess(WORKSPACE_ID, MESSAGE_ID, NOW);
  const url = new URL(access.url, 'http://localhost');
  const expires = Number(url.searchParams.get('expires'));

  await assert.rejects(media.read(WORKSPACE_ID, MESSAGE_ID, expires, 'x'.repeat(43), NOW), InvalidMediaSignatureError);
  await assert.rejects(
    media.read(WORKSPACE_ID, MESSAGE_ID, expires, url.searchParams.get('signature') ?? '', new Date('2026-07-21T12:02:01.000Z')),
    InvalidMediaSignatureError,
  );
  await assert.rejects(media.createAccess('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', MESSAGE_ID, NOW), MediaNotFoundError);
});
