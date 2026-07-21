import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MessageIngestionRepository,
  PersistMessageCommand,
} from './message-ingestion.js';
import {
  hashContent,
  MessageIngestionService,
  UnsupportedChatError,
} from './message-ingestion.js';

class RecordingRepository implements MessageIngestionRepository {
  public received?: PersistMessageCommand;

  public async persist(command: PersistMessageCommand) {
    this.received = command;
    return {
      messageId: '71eb08da-e9a7-41a2-97bd-e1bd6780802b',
      contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
      negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
      duplicate: false,
    };
  }
}

test('calcula hash antes de atravessar a porta de persistência', async () => {
  const repository = new RecordingRepository();
  const service = new MessageIngestionService(repository);

  await service.execute({
    workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
    whatsappAccountId: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
    externalMessageId: 'message-123',
    remoteJid: '5571999999999@s.whatsapp.net',
    phoneNumber: '5571999999999',
    direction: 'inbound',
    messageType: 'text',
    content: 'Preciso de uma proposta',
    occurredAt: new Date('2026-07-20T12:00:00.000Z'),
  });

  assert.equal(repository.received?.contentHash, hashContent('Preciso de uma proposta'));
  assert.equal(repository.received?.content, 'Preciso de uma proposta');
});

test('não cria hash artificial para mídia sem conteúdo textual', async () => {
  const repository = new RecordingRepository();
  const service = new MessageIngestionService(repository);

  await service.execute({
    workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
    whatsappAccountId: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
    externalMessageId: 'audio-123',
    remoteJid: '5571999999999@s.whatsapp.net',
    phoneNumber: '5571999999999',
    direction: 'inbound',
    messageType: 'audio',
    occurredAt: new Date('2026-07-20T12:00:00.000Z'),
  });

  assert.equal(repository.received?.contentHash, undefined);
});

test('normaliza telefone antes da persistência', async () => {
  const repository = new RecordingRepository();
  const service = new MessageIngestionService(repository);

  await service.execute({
    workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
    whatsappAccountId: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
    externalMessageId: 'message-124',
    remoteJid: '5571999999999@s.whatsapp.net',
    phoneNumber: '+55 (71) 99999-9999',
    direction: 'inbound',
    messageType: 'text',
    content: 'Olá',
    occurredAt: new Date('2026-07-20T12:00:00.000Z'),
  });

  assert.equal(repository.received?.phoneNumber, '5571999999999');
});

test('recusa grupos antes de criar contato', async () => {
  const repository = new RecordingRepository();
  const service = new MessageIngestionService(repository);

  await assert.rejects(
    service.execute({
      workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
      whatsappAccountId: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
      externalMessageId: 'group-message',
      remoteJid: '120363000000000000@g.us',
      phoneNumber: '5571999999999',
      direction: 'inbound',
      messageType: 'text',
      content: 'Mensagem de grupo',
      occurredAt: new Date('2026-07-20T12:00:00.000Z'),
    }),
    UnsupportedChatError,
  );
  assert.equal(repository.received, undefined);
});
