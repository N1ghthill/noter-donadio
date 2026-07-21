import assert from 'node:assert/strict';
import test from 'node:test';

import type { MessageIngestionRepository } from './message-ingestion.js';
import { MessageIngestionService } from './message-ingestion.js';
import {
  DemoMessageService,
  DemoWhatsappNotConnectedError,
  type ConnectedWhatsappAccountRepository,
} from './demo-message.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const ACCOUNT_ID = '2f31a180-6127-48cd-82da-7b324e49a31d';
const CLIENT_MESSAGE_ID = '11b3f58b-4f89-47f2-93bc-89be57028a48';

test('simulação usa conta conectada e uma chave idempotente fornecida pelo cliente', async () => {
  let persisted: Parameters<MessageIngestionRepository['persist']>[0] | undefined;
  const repository: MessageIngestionRepository = {
    async persist(command) {
      persisted = command;
      return { messageId: 'message-1', contactId: 'contact-1', negotiationId: 'deal-1', duplicate: false };
    },
  };
  const accounts: ConnectedWhatsappAccountRepository = {
    async findConnectedAccountId() { return ACCOUNT_ID; },
  };
  const service = new DemoMessageService(accounts, new MessageIngestionService(repository));

  await service.simulateInbound({
    workspaceId: WORKSPACE_ID,
    clientMessageId: CLIENT_MESSAGE_ID,
    content: 'Mensagem inteiramente fictícia.',
    occurredAt: new Date('2026-07-21T12:00:00.000Z'),
  });

  assert.equal(persisted?.externalMessageId, `demo-${CLIENT_MESSAGE_ID}`);
  assert.equal(persisted?.whatsappAccountId, ACCOUNT_ID);
  assert.equal(persisted?.direction, 'inbound');
  assert.equal(persisted?.metadata?.source, 'local_demo');
});

test('simulação recusa mensagem quando a conta falsa não está conectada', async () => {
  const accounts: ConnectedWhatsappAccountRepository = {
    async findConnectedAccountId() { return null; },
  };
  const repository: MessageIngestionRepository = {
    async persist() { throw new Error('não deveria persistir'); },
  };
  const service = new DemoMessageService(accounts, new MessageIngestionService(repository));

  await assert.rejects(
    service.simulateInbound({
      workspaceId: WORKSPACE_ID,
      clientMessageId: CLIENT_MESSAGE_ID,
      content: 'Mensagem fictícia.',
    }),
    DemoWhatsappNotConnectedError,
  );
});
