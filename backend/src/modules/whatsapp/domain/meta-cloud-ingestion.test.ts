import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MetaCloudAccountNotMappedError,
  MetaCloudAudioNotReadyError,
  MetaCloudIngestionService,
  type MetaCloudInboundMessage,
} from './meta-cloud-ingestion.js';

const textMessage: MetaCloudInboundMessage = {
  provider: 'meta_cloud_api',
  businessAccountId: 'waba-synthetic',
  phoneNumberId: 'phone-synthetic',
  externalMessageId: 'wamid.synthetic',
  remoteJid: '5571000000101@s.whatsapp.net',
  phoneNumber: '5571000000101',
  displayName: 'Contato Fictício',
  direction: 'inbound',
  messageType: 'text',
  content: 'Mensagem inteiramente fictícia.',
  occurredAt: new Date('2026-07-28T05:00:00.000Z'),
};

test('resolve a conta antes de encaminhar texto para a persistência', async () => {
  const commands: unknown[] = [];
  const service = new MetaCloudIngestionService(
    {
      async resolve() {
        return { workspaceId: 'workspace-synthetic', whatsappAccountId: 'account-synthetic' };
      },
    },
    {
      async ingest(command) {
        commands.push(command);
        return { duplicate: false };
      },
    },
  );

  assert.deepEqual(await service.execute([textMessage]), { received: 1, duplicates: 0 });
  assert.deepEqual(commands, [{
    workspaceId: 'workspace-synthetic',
    whatsappAccountId: 'account-synthetic',
    externalMessageId: 'wamid.synthetic',
    remoteJid: '5571000000101@s.whatsapp.net',
    phoneNumber: '5571000000101',
    displayName: 'Contato Fictício',
    direction: 'inbound',
    messageType: 'text',
    content: 'Mensagem inteiramente fictícia.',
    occurredAt: new Date('2026-07-28T05:00:00.000Z'),
    metadata: {
      source: 'meta_cloud_api',
      businessAccountId: 'waba-synthetic',
      phoneNumberId: 'phone-synthetic',
    },
  }]);
});

test('não persiste lote algum quando a conta não está mapeada', async () => {
  let ingestionCalls = 0;
  const service = new MetaCloudIngestionService(
    { async resolve() { return null; } },
    {
      async ingest() {
        ingestionCalls += 1;
        return { duplicate: false };
      },
    },
  );

  await assert.rejects(() => service.execute([textMessage]), MetaCloudAccountNotMappedError);
  assert.equal(ingestionCalls, 0);
});

test('recusa áudio antes de resolver conta ou publicar processamento', async () => {
  let accountCalls = 0;
  const service = new MetaCloudIngestionService(
    {
      async resolve() {
        accountCalls += 1;
        return { workspaceId: 'workspace-synthetic', whatsappAccountId: 'account-synthetic' };
      },
    },
    { async ingest() { return { duplicate: false }; } },
  );

  await assert.rejects(
    () => service.execute([{
      ...textMessage,
      messageType: 'audio',
      content: undefined,
      providerMediaId: 'media-synthetic',
    }]),
    MetaCloudAudioNotReadyError,
  );
  assert.equal(accountCalls, 0);
});
