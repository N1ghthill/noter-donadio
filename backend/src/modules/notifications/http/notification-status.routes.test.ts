import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';

test('resumo de notificações exige admin e não expõe conteúdo da conversa', async (context) => {
  const app = buildApp({
    sessionAuthenticator: {
      async authenticate(token) {
        return token === 'valid-session' ? {
          userId: '10000000-0000-4000-8000-000000000001',
          workspaceId: '20000000-0000-4000-8000-000000000002',
          email: 'synthetic@example.test',
          displayName: 'Usuário sintético',
          role: 'admin',
        } : null;
      },
    },
    notificationStatusRepository: {
      async get() {
        return {
          lastInboundMessageAt: new Date('2026-08-10T16:00:00Z'),
          lastDeliveredAt: new Date('2026-08-10T16:00:12Z'),
          deliveries: { pending: 0, processing: 0, completed: 2, failed: 0 },
        };
      },
    },
    notificationEnabled: true,
  });
  context.after(async () => app.close());

  assert.equal((await app.inject({ method: 'GET', url: '/api/notifications/status' })).statusCode, 401);
  const response = await app.inject({
    method: 'GET',
    url: '/api/notifications/status',
    cookies: { noter_session: 'valid-session' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), {
    enabled: true,
    channel: 'bark',
    automaticWhatsappRepliesEnabled: false,
    lastInboundMessageAt: '2026-08-10T16:00:00.000Z',
    lastDeliveredAt: '2026-08-10T16:00:12.000Z',
    deliveries: { pending: 0, processing: 0, completed: 2, failed: 0 },
  });
  assert.doesNotMatch(response.body, /telefone|conteúdo|mensagem sintética/i);
});
