import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../../../app.js';

test('mutações da API recusam Origin ausente ou fora da lista', async (context) => {
  const app = buildApp({ allowedOrigins: ['http://localhost:5173'] });
  context.after(async () => app.close());

  const missing = await app.inject({ method: 'POST', url: '/api/auth/logout' });
  const foreign = await app.inject({
    method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://malicious.example' },
  });
  assert.equal(missing.statusCode, 403);
  assert.equal(foreign.statusCode, 403);
  assert.deepEqual(foreign.json(), { error: 'invalid_origin' });
});

test('Origin permitido avança para a rota e token interno não depende de Origin', async (context) => {
  const app = buildApp({ allowedOrigins: ['http://localhost:5173'] });
  context.after(async () => app.close());

  const allowed = await app.inject({
    method: 'POST', url: '/api/auth/logout', headers: { origin: 'http://localhost:5173' },
  });
  const internal = await app.inject({ method: 'POST', url: '/api/internal/messages/ingest' });
  assert.equal(allowed.statusCode, 404);
  assert.equal(internal.statusCode, 404);
});
