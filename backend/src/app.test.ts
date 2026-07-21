import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from './app.js';

test('health check expõe somente o estado público mínimo', async (context) => {
  const app = buildApp();
  context.after(async () => app.close());

  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: 'noter-backend',
    status: 'ok',
  });
});
