import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import type { ProcessingFailureRepository } from '../domain/processing-retry.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const USER_ID = 'd86e2931-7552-41f6-831f-85dd34c8bf29';
const MESSAGE_ID = 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

const authenticator: SessionAuthenticator = {
  async authenticate(token) {
    return token ? {
      userId: USER_ID, workspaceId: WORKSPACE_ID, email: 'admin@example.invalid',
      displayName: 'Admin fictício', role: 'admin',
    } : null;
  },
};

test('falhas de processamento exigem admin, confirmação e respeitam o corte', async (context) => {
  let retryInput: Parameters<ProcessingFailureRepository['requestRetry']>[0] | undefined;
  const repository: ProcessingFailureRepository = {
    async list(workspaceId, limit, notBefore) {
      assert.equal(workspaceId, WORKSPACE_ID);
      assert.equal(limit, 25);
      assert.equal(notBefore.toISOString(), '2026-08-01T00:00:00.000Z');
      return [];
    },
    async requestRetry(input) { retryInput = input; return 'queued'; },
  };
  const app = buildApp({
    sessionAuthenticator: authenticator,
    processingFailureRepository: repository,
    processingNotBefore: new Date('2026-08-01T00:00:00.000Z'),
  });
  context.after(() => app.close());

  assert.equal((await app.inject({ method: 'GET', url: '/api/processing-failures' })).statusCode, 401);
  const list = await app.inject({
    method: 'GET', url: '/api/processing-failures?limit=25', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.headers['cache-control'], 'no-store');

  const invalid = await app.inject({
    method: 'POST', url: `/api/processing-failures/analysis/${MESSAGE_ID}/retry`,
    headers: { cookie: SESSION_COOKIE }, payload: { confirmation: WORKSPACE_ID },
  });
  assert.equal(invalid.statusCode, 400);
  const queued = await app.inject({
    method: 'POST', url: `/api/processing-failures/analysis/${MESSAGE_ID}/retry`,
    headers: { cookie: SESSION_COOKIE }, payload: { confirmation: MESSAGE_ID },
  });
  assert.equal(queued.statusCode, 202);
  assert.equal(retryInput?.workspaceId, WORKSPACE_ID);
  assert.equal(retryInput?.userId, USER_ID);
  assert.equal(retryInput?.messageId, MESSAGE_ID);
  assert.equal(retryInput?.kind, 'analysis');
});
