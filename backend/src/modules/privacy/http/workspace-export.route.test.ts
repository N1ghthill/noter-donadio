import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import type { WorkspaceExportRepository } from '../domain/workspace-export.js';

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

test('exportação exige administrador e deriva workspace e usuário da sessão', async (context) => {
  let received: Parameters<WorkspaceExportRepository['exportWorkspace']>[0] | undefined;
  const repository: WorkspaceExportRepository = {
    async exportWorkspace(input) {
      received = input;
      return {
        schemaVersion: 'workspace-export-v1',
        exportedAt: '2026-07-21T12:00:00.000Z',
        workspace: {
          id: WORKSPACE_ID, slug: 'demo seguro', name: 'Demo',
          createdAt: '2026-07-20T12:00:00.000Z', updatedAt: '2026-07-21T12:00:00.000Z',
        },
        data: { contacts: [] },
      };
    },
  };
  const app = buildApp({ sessionAuthenticator: authenticator, workspaceExportRepository: repository });
  context.after(() => app.close());

  const unauthorized = await app.inject({ method: 'GET', url: '/api/privacy/workspace-export' });
  assert.equal(unauthorized.statusCode, 401);

  const response = await app.inject({
    method: 'GET', url: '/api/privacy/workspace-export', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['content-disposition'], 'attachment; filename="noter-demo-seguro-2026-07-21.json"');
  assert.equal(received?.workspaceId, WORKSPACE_ID);
  assert.equal(received?.userId, USER_ID);
  assert.equal(response.json().schemaVersion, 'workspace-export-v1');
});
