import assert from 'node:assert/strict';
import test from 'node:test';

import type { WAMessage } from 'baileys';

import type { EncryptedProviderReference } from '../../media/domain/media-storage.js';
import { AuthStateCipher } from './auth-state-cipher.js';
import { BaileysMediaReferenceCipher } from './baileys-media-reference.js';
import {
  BaileysMediaRecovery,
  type BaileysMediaRecoveryRepository,
} from './baileys-media-recovery.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const accountId = '20000000-0000-4000-8000-000000000002';
const messageId = '30000000-0000-4000-8000-000000000003';
const externalMessageId = 'synthetic-image';

test('solicita reupload sem conteúdo e persiste somente a nova referência cifrada', async () => {
  const cipher = new BaileysMediaReferenceCipher(
    new AuthStateCipher(new Map([[1, Buffer.alloc(32, 4)]]), 1),
  );
  const binding = { workspaceId, accountId, externalMessageId };
  const original = cipher.encrypt({
    directPath: '/synthetic/expired',
    mediaKey: Buffer.alloc(32, 5),
    retryRemoteJid: '123456789012345@lid',
  }, binding);
  let updatedReference: EncryptedProviderReference | undefined;
  const repository: BaileysMediaRecoveryRepository = {
    async find() {
      return {
        assetId: '40000000-0000-4000-8000-000000000004',
        workspaceId,
        accountId,
        externalMessageId,
        remoteJid: '5571000000000@s.whatsapp.net',
        fromMe: false,
        messageType: 'image',
        encryptedReference: original,
      };
    },
    async update(_assetId, reference) {
      updatedReference = reference;
      return true;
    },
  };
  let requestedMessage: WAMessage | undefined;
  const recovery = new BaileysMediaRecovery(repository, cipher);

  await recovery.execute({
    async updateMediaMessage(message) {
      requestedMessage = message;
      if (message.message?.imageMessage) {
        message.message.imageMessage.directPath = '/synthetic/recovered';
        message.message.imageMessage.url = 'https://example.test/recovered';
      }
      return message;
    },
  }, { workspaceId, accountId, messageId });

  assert.equal(requestedMessage?.key.id, externalMessageId);
  assert.equal(requestedMessage?.key.remoteJid, '123456789012345@lid');
  assert.equal(requestedMessage?.key.fromMe, false);
  assert.equal(requestedMessage?.message?.imageMessage?.caption, undefined);
  assert.ok(updatedReference);
  assert.equal(cipher.decrypt(updatedReference, binding).directPath, '/synthetic/recovered');
});
