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

test('proxy confiável usa o endereço encaminhado para controles por origem', async (context) => {
  const app = buildApp({ trustProxy: true });
  context.after(async () => app.close());
  app.get('/test/client-address', async (request) => ({ ip: request.ip }));

  const response = await app.inject({
    method: 'GET',
    url: '/test/client-address',
    headers: { 'x-forwarded-for': '203.0.113.10' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ip: '203.0.113.10' });
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

test('métricas operacionais exigem token e usam formato Prometheus sem cache', async (context) => {
  const app = buildApp({
    internalIngestionToken: 'token-interno-de-teste',
    readinessProbe: { async check() { return { database: 'ok', redis: 'ok' }; } },
    metricsCollector: {
      async collect() {
        return {
          pipelinesEnabled: { media_download: true, transcription: false, analysis: false },
          outbox: { pending: 1, processing: 0, published: 2, failed: 0 },
          mediaDownloads: { pending: 0, processing: 0, completed: 1, failed: 0 },
          transcriptions: { pending: 0, processing: 0, completed: 1, failed: 0 },
          analyses: { pending: 0, processing: 0, completed: 1, failed: 0 },
          mediaDeletionTasks: 0,
          oldestPendingOutboxAgeSeconds: 5,
          oldestPendingMediaDownloadAgeSeconds: 0,
          oldestPendingTranscriptionAgeSeconds: 0,
          oldestPendingAnalysisAgeSeconds: 0,
          queues: {
            'ai-processing': { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 },
            'media-download': { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 },
            'audio-transcription': { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 },
            'realtime-events': { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 },
          },
        };
      },
    },
  });
  context.after(async () => app.close());

  assert.equal((await app.inject({ method: 'GET', url: '/api/internal/metrics' })).statusCode, 401);
  const response = await app.inject({
    method: 'GET', url: '/api/internal/metrics',
    headers: { 'x-internal-token': 'token-interno-de-teste' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(String(response.headers['content-type']), /text\/plain/);
  assert.match(response.body, /noter_outbox_events\{status="pending"\} 1/);
});

test('falha das métricas retorna 503 sem detalhes internos', async (context) => {
  const app = buildApp({
    internalIngestionToken: 'token-interno-de-teste',
    readinessProbe: { async check() { return { database: 'ok', redis: 'ok' }; } },
    metricsCollector: { async collect() { throw new Error('redis://segredo-interno'); } },
  });
  context.after(async () => app.close());

  const response = await app.inject({
    method: 'GET', url: '/api/internal/metrics',
    headers: { 'x-internal-token': 'token-interno-de-teste' },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body, '# metrics unavailable\n');
  assert.doesNotMatch(response.body, /redis|segredo/);
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
