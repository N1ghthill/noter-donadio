import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { MediaAccessService } from '../domain/media-access.js';
import type { ContactFileRepository } from '../domain/contact-file.repository.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const MESSAGE_ID = '11b3f58b-4f89-47f2-93bc-89be57028a48';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

const authenticator: SessionAuthenticator = {
  async authenticate(token) {
    return token ? {
      userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
      workspaceId: WORKSPACE_ID,
      email: 'admin@example.invalid',
      displayName: 'Admin fictício',
      role: 'admin',
    } : null;
  },
};

function mediaService() {
  return new MediaAccessService({
    async findAccessible(workspaceId, messageId) {
      return workspaceId === WORKSPACE_ID && messageId === MESSAGE_ID
        ? {
            storageKey: `${WORKSPACE_ID}/${MESSAGE_ID}.wav`,
            mimeType: 'audio/wav',
            durationSeconds: 1,
            fileName: 'audio.wav',
            disposition: 'inline' as const,
          }
        : null;
    },
  }, {
    async write() {},
    async read() { return Buffer.from('audio-ficticio'); },
    async delete() {},
  }, 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres');
}

test('acesso à mídia exige sessão e não expõe chave de armazenamento', async () => {
  const app = buildApp({ sessionAuthenticator: authenticator, mediaAccessService: mediaService() });
  const unauthorized = await app.inject({ method: 'GET', url: `/api/media/${MESSAGE_ID}/access` });
  assert.equal(unauthorized.statusCode, 401);

  const response = await app.inject({
    method: 'GET',
    url: `/api/media/${MESSAGE_ID}/access`,
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ url: string }>();
  assert.match(body.url, new RegExp(`^/api/media/${MESSAGE_ID}/content\\?`));
  assert.doesNotMatch(response.body, /storageKey|storage_key/);
  await app.close();
});

test('conteúdo valida assinatura e mantém cache privado desabilitado', async () => {
  const app = buildApp({ sessionAuthenticator: authenticator, mediaAccessService: mediaService() });
  const access = await app.inject({
    method: 'GET',
    url: `/api/media/${MESSAGE_ID}/access`,
    headers: { cookie: SESSION_COOKIE },
  });
  const url = access.json<{ url: string }>().url;
  const content = await app.inject({ method: 'GET', url, headers: { cookie: SESSION_COOKIE } });
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers['content-type'], 'audio/wav');
  assert.equal(content.headers['cache-control'], 'private, no-store');

  const invalid = await app.inject({
    method: 'GET',
    url: `/api/media/${MESSAGE_ID}/content?expires=1&signature=${'x'.repeat(43)}`,
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(invalid.statusCode, 403);
  await app.close();
});

test('documento usa nome seguro e força download autenticado', async () => {
  const service = new MediaAccessService({
    async findAccessible() {
      return {
        storageKey: `${WORKSPACE_ID}/${MESSAGE_ID}.pdf`,
        mimeType: 'application/pdf',
        durationSeconds: null,
        fileName: 'proposta fictícia.pdf',
        disposition: 'attachment',
      };
    },
  }, {
    async write() {},
    async read() { return Buffer.from('pdf-ficticio'); },
    async delete() {},
  }, 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres');
  const app = buildApp({ sessionAuthenticator: authenticator, mediaAccessService: service });
  const access = await app.inject({
    method: 'GET',
    url: `/api/media/${MESSAGE_ID}/access`,
    headers: { cookie: SESSION_COOKIE },
  });
  const content = await app.inject({
    method: 'GET',
    url: access.json<{ url: string }>().url,
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(content.statusCode, 200);
  assert.equal(
    content.headers['content-disposition'],
    "attachment; filename*=UTF-8''proposta%20fict%C3%ADcia.pdf",
  );
  await app.close();
});

test('catálogo de arquivos usa workspace da sessão e filtros validados', async () => {
  let received: Parameters<ContactFileRepository['list']>[0] | undefined;
  const repository: ContactFileRepository = {
    async list(input) {
      received = input;
      return [{
        messageId: MESSAGE_ID,
        contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
        contactName: 'Contato fictício',
        negotiationId: null,
        messageType: 'audio',
        direction: 'inbound',
        fileName: 'audio-2026-07-29.ogg',
        mimeType: 'audio/ogg',
        fileSizeBytes: '1024',
        durationSeconds: 3,
        transcriptionState: 'pending',
        caption: null,
        occurredAt: '2026-07-29T12:00:00.000Z',
      }];
    },
  };
  const app = buildApp({
    sessionAuthenticator: authenticator,
    mediaAccessService: mediaService(),
    contactFileRepository: repository,
  });

  assert.equal((await app.inject({ method: 'GET', url: '/api/files' })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'GET', url: '/api/files?contactId=invalido', headers: { cookie: SESSION_COOKIE },
  })).statusCode, 400);
  const response = await app.inject({
    method: 'GET',
    url: '/api/files?contactId=3a3db76b-c51a-4584-ab4b-6d3e70952e44&search=Contato'
      + '&fileType=image&direction=inbound'
      + '&occurredFrom=2026-07-29T00%3A00%3A00.000Z'
      + '&occurredTo=2026-07-30T00%3A00%3A00.000Z&limit=20',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(received?.workspaceId, WORKSPACE_ID);
  assert.equal(received?.contactId, '3a3db76b-c51a-4584-ab4b-6d3e70952e44');
  assert.equal(received?.search, 'Contato');
  assert.equal(received?.fileType, 'image');
  assert.equal(received?.direction, 'inbound');
  assert.deepEqual(received?.occurredFrom, new Date('2026-07-29T00:00:00.000Z'));
  assert.deepEqual(received?.occurredTo, new Date('2026-07-30T00:00:00.000Z'));
  assert.equal(received?.limit, 20);
  assert.ok(received?.now instanceof Date);
  assert.doesNotMatch(response.body, /storageKey|storage_key/);
  assert.equal((await app.inject({
    method: 'GET',
    url: '/api/files?occurredFrom=2026-07-30T00%3A00%3A00.000Z'
      + '&occurredTo=2026-07-29T00%3A00%3A00.000Z',
    headers: { cookie: SESSION_COOKIE },
  })).statusCode, 400);
  await app.close();
});
