import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';

test('capacidades operacionais exigem sessão e não expõem configuração interna', async () => {
  const app = buildApp({
    sessionAuthenticator: {
      async authenticate(token) {
        return token === 'valid-session'
          ? {
              userId: '10000000-0000-4000-8000-000000000001',
              workspaceId: '20000000-0000-4000-8000-000000000002',
              email: 'synthetic@example.test',
              displayName: 'Usuário sintético',
              role: 'admin',
            }
          : null;
      },
    },
    productCapabilities: {
      demoSimulationEnabled: false,
      audioTranscriptionEnabled: false,
      messageAnalysisEnabled: false,
    },
  });
  test.after(async () => app.close());

  assert.equal((await app.inject({ method: 'GET', url: '/api/capabilities' })).statusCode, 401);
  const response = await app.inject({
    method: 'GET',
    url: '/api/capabilities',
    cookies: { noter_session: 'valid-session' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), {
    demoSimulationEnabled: false,
    audioTranscriptionEnabled: false,
    messageAnalysisEnabled: false,
  });
});
