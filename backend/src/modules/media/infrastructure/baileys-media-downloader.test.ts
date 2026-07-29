import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AuthStateCipher } from '../../whatsapp/infrastructure/auth-state-cipher.js';
import { BaileysMediaReferenceCipher } from '../../whatsapp/infrastructure/baileys-media-reference.js';
import { BaileysMediaDownloader } from './baileys-media-downloader.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const accountId = '20000000-0000-4000-8000-000000000002';
const messageId = '30000000-0000-4000-8000-000000000003';
const externalMessageId = 'synthetic-audio';

test('baixa somente a referência Baileys cifrada vinculada à mensagem', async () => {
  const cipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 4)]]), 1),
  );
  const encrypted = cipher.encrypt({
    directPath: '/synthetic/audio',
    mediaKey: Buffer.alloc(32, 5),
  }, { workspaceId, accountId, externalMessageId });
  const prisma = {
    mediaAsset: {
      async findFirst() {
        return {
          encryptedProviderReference: Buffer.from(encrypted.encryptedData),
          providerReferenceIv: Buffer.from(encrypted.iv),
          providerReferenceAuthTag: Buffer.from(encrypted.authTag),
          providerReferenceKeyVersion: encrypted.encryptionKeyVersion,
          mimeType: 'audio/ogg; codecs=opus',
          durationSeconds: 4,
          message: { externalMessageId, whatsappAccountId: accountId },
        };
      },
    },
  } as unknown as PrismaClient;
  let receivedPath: string | undefined;
  const downloader = new BaileysMediaDownloader(
    prisma,
    cipher,
    10,
    async function* (reference) {
      receivedPath = reference.directPath;
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    },
  );

  assert.deepEqual(await downloader.download({
    workspaceId,
    messageId,
    attemptId: '40000000-0000-4000-8000-000000000004',
    externalMediaId: externalMessageId,
    expectedMimeType: 'audio/ogg; codecs=opus',
    provider: null,
    providerPhoneNumberId: null,
  }), {
    bytes: Buffer.from([1, 2, 3]),
    mimeType: 'audio/ogg',
    durationSeconds: 4,
  });
  assert.equal(receivedPath, '/synthetic/audio');
});

test('interrompe download que ultrapassa o limite configurado', async () => {
  const cipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 4)]]), 1),
  );
  const encrypted = cipher.encrypt({
    directPath: '/synthetic/audio',
    mediaKey: Buffer.alloc(32, 5),
  }, { workspaceId, accountId, externalMessageId });
  const prisma = {
    mediaAsset: {
      async findFirst() {
        return {
          encryptedProviderReference: Buffer.from(encrypted.encryptedData),
          providerReferenceIv: Buffer.from(encrypted.iv),
          providerReferenceAuthTag: Buffer.from(encrypted.authTag),
          providerReferenceKeyVersion: encrypted.encryptionKeyVersion,
          mimeType: 'audio/ogg',
          durationSeconds: null,
          message: { externalMessageId, whatsappAccountId: accountId },
        };
      },
    },
  } as unknown as PrismaClient;
  const downloader = new BaileysMediaDownloader(
    prisma,
    cipher,
    2,
    async function* () { yield new Uint8Array([1, 2, 3]); },
  );

  await assert.rejects(() => downloader.download({
    workspaceId,
    messageId,
    attemptId: '40000000-0000-4000-8000-000000000004',
    externalMediaId: externalMessageId,
    expectedMimeType: 'audio/ogg',
    provider: null,
    providerPhoneNumberId: null,
  }), /baileys_media_too_large/);
});
