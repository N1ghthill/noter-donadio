import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import type { AuditLogRepository } from '../domain/audit-log.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const USER_ID = 'd86e2931-7552-41f6-831f-85dd34c8bf29';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

const authenticator: SessionAuthenticator = {
  async authenticate(token) {
    return token ? {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      email: 'admin@example.invalid',
      displayName: 'Admin fictício',
      role: 'admin',
    } : null;
  },
};

test('auditoria global exige administrador e valida filtros', async (context) => {
  let received: Parameters<AuditLogRepository['list']>[0] | undefined;
  const repository: AuditLogRepository = {
    async list(input) {
      received = input;
      return [{
        id: '36e0bd12-2a5d-40e1-9644-7089e49ae08e',
        action: 'workspace_exported',
        actorDisplayName: 'Admin fictício',
        contactId: null,
        negotiationId: null,
        changedFields: [],
        previousVersion: null,
        resultingVersion: null,
        details: { schemaVersion: 'workspace-export-v1' },
        createdAt: '2026-07-22T10:00:00.000Z',
      }];
    },
  };
  const app = buildApp({ sessionAuthenticator: authenticator, auditLogRepository: repository });
  context.after(() => app.close());

  assert.equal((await app.inject({ method: 'GET', url: '/api/audit-events' })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'GET', url: '/api/audit-events?limit=101', headers: { cookie: SESSION_COOKIE },
  })).statusCode, 400);

  const response = await app.inject({
    method: 'GET',
    url: '/api/audit-events?limit=25&action=workspace_exported',
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(received, {
    workspaceId: WORKSPACE_ID,
    limit: 25,
    action: 'workspace_exported',
  });
  assert.equal(response.json().data[0].action, 'workspace_exported');
});
