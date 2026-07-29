import assert from 'node:assert/strict';
import test from 'node:test';

import type { MediaStorage } from './media-storage.js';
import {
  MediaDownloadFailedError,
  MediaDownloadService,
  type MediaDownloadRepository,
  type MediaDownloadTarget,
  validateDownloadedMedia,
} from './media-download.js';

const target: MediaDownloadTarget = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: '71eb08da-e9a7-41a2-97bd-e1bd6780802b',
  attemptId: '91a408dd-6933-4d69-bcdb-93e1e23c03d5',
  externalMediaId: 'media-synthetic',
  expectedMimeType: null,
  provider: null,
  providerPhoneNumberId: null,
  messageType: 'audio',
};

test('grava a mídia antes de liberar a transcrição', async () => {
  const operations: string[] = [];
  const repository: MediaDownloadRepository = {
    async claim() { return { status: 'claimed', target }; },
    async complete(input) {
      operations.push(`complete:${input.storageKey}`);
      return true;
    },
    async fail() { operations.push('fail'); },
  };
  const storage: MediaStorage = {
    async write(key) { operations.push(`write:${key}`); },
    async read() { throw new Error('not_used'); },
    async delete() { operations.push('delete'); },
  };
  const service = new MediaDownloadService(
    repository,
    {
      async download() {
        return {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'audio/ogg',
          durationSeconds: 2,
        };
      },
    },
    storage,
    30,
  );

  assert.deepEqual(
    await service.execute(target.workspaceId, target.messageId, new Date('2026-07-28T06:00:00Z')),
    { status: 'completed' },
  );
  assert.deepEqual(operations, [
    `write:${target.workspaceId}/${target.attemptId}.media`,
    `complete:${target.workspaceId}/${target.attemptId}.media`,
  ]);
});

test('aceita formatos seguros de imagem e documento e recusa conteúdo ativo', () => {
  assert.equal(validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'image/jpeg',
    durationSeconds: null,
  }, 'image/jpeg').mimeType, 'image/jpeg');
  assert.equal(validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'application/pdf',
    durationSeconds: null,
  }, 'application/pdf').mimeType, 'application/pdf');
  assert.throws(() => validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'image/svg+xml',
    durationSeconds: null,
  }, 'image/svg+xml'), /invalid_media_mime_type/);
  assert.throws(() => validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'text/html',
    durationSeconds: null,
  }, 'text/html'), /invalid_media_mime_type/);
  assert.throws(() => validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'application/pdf',
    durationSeconds: null,
  }, 'application/pdf', 'image'), /invalid_media_mime_type/);
});

test('falha com código sanitizado quando o adapter devolve mídia inválida', async () => {
  let failureCode: string | undefined;
  const repository: MediaDownloadRepository = {
    async claim() { return { status: 'claimed', target }; },
    async complete() { return false; },
    async fail(input) { failureCode = input.failureCode; },
  };
  const service = new MediaDownloadService(
    repository,
    {
      async download() {
        return { bytes: new Uint8Array(), mimeType: 'text/plain', durationSeconds: null };
      },
    },
    {
      async write() {},
      async read() { throw new Error('not_used'); },
      async delete() {},
    },
    30,
  );

  await assert.rejects(
    () => service.execute(target.workspaceId, target.messageId),
    MediaDownloadFailedError,
  );
  assert.equal(failureCode, 'MEDIA_DOWNLOAD_FAILED');
});

test('reentrega concluída não chama adapter nem armazenamento', async () => {
  let externalCalls = 0;
  const service = new MediaDownloadService(
    {
      async claim() { return { status: 'completed' }; },
      async complete() { return false; },
      async fail() {},
    },
    {
      async download() {
        externalCalls += 1;
        return { bytes: new Uint8Array([1]), mimeType: 'audio/wav', durationSeconds: 1 };
      },
    },
    {
      async write() { externalCalls += 1; },
      async read() { throw new Error('not_used'); },
      async delete() {},
    },
    30,
  );

  assert.deepEqual(await service.execute(target.workspaceId, target.messageId), {
    status: 'already_completed',
  });
  assert.equal(externalCalls, 0);
});

test('compara MIME por tipo base quando o webhook inclui parâmetros de codec', () => {
  assert.deepEqual(validateDownloadedMedia({
    bytes: new Uint8Array([1]),
    mimeType: 'audio/ogg',
    durationSeconds: null,
  }, 'audio/ogg; codecs=opus'), {
    bytes: new Uint8Array([1]),
    mimeType: 'audio/ogg',
    durationSeconds: null,
  });
});
