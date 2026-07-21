import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import type { ConversationRepository } from '../domain/conversation.repository.js';
import { DemoMessageService, type ConnectedWhatsappAccountRepository } from '../domain/demo-message.js';
import { MessageIngestionService, type MessageIngestionRepository } from '../domain/message-ingestion.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const ACCOUNT_ID = '2f31a180-6127-48cd-82da-7b324e49a31d';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

class FakeSessionAuthenticator implements SessionAuthenticator {
  public async authenticate(token: string | undefined) {
    return token === 'valid-session-token-with-more-than-forty-characters'
      ? {
          userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
          workspaceId: WORKSPACE_ID,
          email: 'admin@example.test',
          displayName: 'Admin',
          role: 'admin' as const,
        }
      : null;
  }
}

test('lista conversas somente do workspace autenticado', async (context) => {
  let requestedWorkspace: string | undefined;
  let requestedLimit: number | undefined;
  const repository: ConversationRepository = {
    async list(workspaceId, limit) {
      requestedWorkspace = workspaceId;
      requestedLimit = limit;
      return [];
    },
  };
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    conversationRepository: repository,
  });
  context.after(async () => app.close());

  const unauthorized = await app.inject({ method: 'GET', url: '/api/conversations' });
  assert.equal(unauthorized.statusCode, 401);

  const response = await app.inject({
    method: 'GET',
    url: '/api/conversations?limit=25&workspaceId=forjado',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(requestedWorkspace, WORKSPACE_ID);
  assert.equal(requestedLimit, 25);
});

test('simula mensagem idempotente sem aceitar conta ou workspace do navegador', async (context) => {
  let persisted: Parameters<MessageIngestionRepository['persist']>[0] | undefined;
  const conversations: ConversationRepository = { async list() { return []; } };
  const accounts: ConnectedWhatsappAccountRepository = {
    async findConnectedAccountId(workspaceId) {
      assert.equal(workspaceId, WORKSPACE_ID);
      return ACCOUNT_ID;
    },
  };
  const ingestionRepository: MessageIngestionRepository = {
    async persist(command) {
      persisted = command;
      return { messageId: 'message-1', contactId: 'contact-1', negotiationId: 'deal-1', duplicate: false };
    },
  };
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    conversationRepository: conversations,
    demoMessageService: new DemoMessageService(
      accounts,
      new MessageIngestionService(ingestionRepository),
    ),
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/demo/messages',
    headers: { cookie: SESSION_COOKIE },
    payload: {
      clientMessageId: '11b3f58b-4f89-47f2-93bc-89be57028a48',
      content: 'Mensagem fictícia recebida.',
      workspaceId: 'workspace-forjado',
      whatsappAccountId: 'conta-forjada',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(persisted?.workspaceId, WORKSPACE_ID);
  assert.equal(persisted?.whatsappAccountId, ACCOUNT_ID);
  assert.equal(persisted?.content, 'Mensagem fictícia recebida.');
});

test('simulação informa quando o WhatsApp falso não está conectado', async (context) => {
  const conversations: ConversationRepository = { async list() { return []; } };
  const accounts: ConnectedWhatsappAccountRepository = {
    async findConnectedAccountId() { return null; },
  };
  const ingestionRepository: MessageIngestionRepository = {
    async persist() { throw new Error('não deveria persistir'); },
  };
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    conversationRepository: conversations,
    demoMessageService: new DemoMessageService(
      accounts,
      new MessageIngestionService(ingestionRepository),
    ),
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/demo/messages',
    headers: { cookie: SESSION_COOKIE },
    payload: {
      clientMessageId: '11b3f58b-4f89-47f2-93bc-89be57028a48',
      content: 'Mensagem fictícia.',
    },
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: 'whatsapp_not_connected' });
});

test('simulação de áudio não aceita conteúdo como transcrição', async (context) => {
  let persisted: Parameters<MessageIngestionRepository['persist']>[0] | undefined;
  const conversations: ConversationRepository = { async list() { return []; } };
  const accounts: ConnectedWhatsappAccountRepository = {
    async findConnectedAccountId() { return ACCOUNT_ID; },
  };
  const ingestionRepository: MessageIngestionRepository = {
    async persist(command) {
      persisted = command;
      return { messageId: 'message-1', contactId: 'contact-1', negotiationId: 'deal-1', duplicate: false };
    },
  };
  const app = buildApp({
    sessionAuthenticator: new FakeSessionAuthenticator(),
    conversationRepository: conversations,
    demoMessageService: new DemoMessageService(
      accounts,
      new MessageIngestionService(ingestionRepository),
    ),
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/demo/messages',
    headers: { cookie: SESSION_COOKIE },
    payload: {
      clientMessageId: '11b3f58b-4f89-47f2-93bc-89be57028a48',
      messageType: 'audio',
      content: 'texto forjado pelo navegador',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(persisted?.messageType, 'audio');
  assert.equal(persisted?.content, undefined);
});
