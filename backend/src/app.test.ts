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

test('readiness detalhado exige token interno e reporta dependências', async (context) => {
  const app = buildApp({
    internalIngestionToken: 'token-interno-de-teste',
    readinessProbe: {
      async check() {
        return { database: 'ok', redis: 'ok' };
      },
    },
  });
  context.after(async () => app.close());

  const unauthorized = await app.inject({
    method: 'GET',
    url: '/api/internal/health/ready',
  });
  assert.equal(unauthorized.statusCode, 401);

  const response = await app.inject({
    method: 'GET',
    url: '/api/internal/health/ready',
    headers: { 'x-internal-token': 'token-interno-de-teste' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), {
    service: 'noter-backend',
    status: 'ready',
    checks: { database: 'ok', redis: 'ok' },
  });
});

test('readiness retorna 503 sem revelar detalhes de conexão', async (context) => {
  const app = buildApp({
    internalIngestionToken: 'token-interno-de-teste',
    readinessProbe: {
      async check() {
        return { database: 'ok', redis: 'unavailable' };
      },
    },
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/internal/health/ready',
    headers: { 'x-internal-token': 'token-interno-de-teste' },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    service: 'noter-backend',
    status: 'unavailable',
    checks: { database: 'ok', redis: 'unavailable' },
  });
});

test('corpo JSON vazio é recusado como requisição inválida sem erro interno', async (context) => {
  const app = buildApp();
  app.post('/test/json', async () => ({ ok: true }));
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/test/json',
    headers: { 'content-type': 'application/json' },
    payload: '',
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'invalid_request' });
});
