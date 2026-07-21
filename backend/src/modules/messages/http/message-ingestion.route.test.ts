import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type {
  MessageIngestionRepository,
  PersistMessageCommand,
} from '../domain/message-ingestion.js';
import { MessageIngestionService } from '../domain/message-ingestion.js';

const INTERNAL_TOKEN = 'test-token-with-at-least-32-characters';

class IdempotentFakeRepository implements MessageIngestionRepository {
  private readonly messageIds = new Set<string>();
  public calls: PersistMessageCommand[] = [];

  public async persist(command: PersistMessageCommand) {
    this.calls.push(command);
    const duplicate = this.messageIds.has(command.externalMessageId);
    this.messageIds.add(command.externalMessageId);

    return {
      messageId: '71eb08da-e9a7-41a2-97bd-e1bd6780802b',
      contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
      negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
      duplicate,
    };
  }
}

const validPayload = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  whatsappAccountId: '8ab0841d-234e-477c-9f3e-4ac9f3d9f7eb',
  externalMessageId: 'message-123',
  remoteJid: '5571999999999@s.whatsapp.net',
  phoneNumber: '5571999999999',
  direction: 'inbound',
  messageType: 'text',
  content: 'Preciso de uma proposta',
  occurredAt: '2026-07-20T12:00:00.000Z',
};

test('protege a ingestão interna com token', async (context) => {
  const repository = new IdempotentFakeRepository();
  const app = buildApp({
    ingestionService: new MessageIngestionService(repository),
    internalIngestionToken: INTERNAL_TOKEN,
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/messages/ingest',
    payload: validPayload,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(repository.calls.length, 0);
});

test('diferencia criação e reentrega idempotente', async (context) => {
  const repository = new IdempotentFakeRepository();
  const app = buildApp({
    ingestionService: new MessageIngestionService(repository),
    internalIngestionToken: INTERNAL_TOKEN,
  });
  context.after(async () => app.close());

  const request = () =>
    app.inject({
      method: 'POST',
      url: '/api/internal/messages/ingest',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      payload: validPayload,
    });

  const created = await request();
  const duplicate = await request();

  assert.equal(created.statusCode, 201);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(created.json().duplicate, false);
  assert.equal(duplicate.json().duplicate, true);
});

test('não devolve detalhes de validação potencialmente sensíveis', async (context) => {
  const repository = new IdempotentFakeRepository();
  const app = buildApp({
    ingestionService: new MessageIngestionService(repository),
    internalIngestionToken: INTERNAL_TOKEN,
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/messages/ingest',
    headers: { 'x-internal-token': INTERNAL_TOKEN },
    payload: { ...validPayload, phoneNumber: 'inválido' },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.includes('inválido'), false);
});
