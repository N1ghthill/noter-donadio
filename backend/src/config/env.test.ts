import assert from 'node:assert/strict';
import test from 'node:test';

import { readEnvironment } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://noter:noter@127.0.0.1:5432/noter',
  REDIS_URL: 'redis://127.0.0.1:6379',
  INTERNAL_INGESTION_TOKEN: 'token-de-teste-com-mais-de-trinta-e-dois-caracteres',
  MEDIA_SIGNING_SECRET: 'segredo-de-midia-com-mais-de-trinta-e-dois-caracteres',
};

test('normaliza a lista explícita de origens permitidas', () => {
  const environment = readEnvironment({
    ...required,
    APP_ORIGINS: 'http://localhost:5173/, https://app.example.test',
  });
  assert.deepEqual(environment.APP_ORIGINS, [
    'http://localhost:5173',
    'https://app.example.test',
  ]);
});

test('recusa URL com caminho na configuração de Origin', () => {
  assert.throws(() => readEnvironment({
    ...required,
    APP_ORIGINS: 'https://app.example.test/subpath',
  }));
});

test('webhook Meta permanece desligado por padrão', () => {
  const environment = readEnvironment(required);
  assert.equal(environment.META_WEBHOOK_ENABLED, false);
  assert.equal(environment.META_WEBHOOK_VERIFY_TOKEN, undefined);
  assert.equal(environment.META_APP_SECRET, undefined);
});

test('webhook Meta ativo exige ambos os segredos', () => {
  assert.throws(() => readEnvironment({
    ...required,
    META_WEBHOOK_ENABLED: '1',
  }));

  const environment = readEnvironment({
    ...required,
    META_WEBHOOK_ENABLED: '1',
    META_WEBHOOK_VERIFY_TOKEN: 'token-de-verificacao-com-mais-de-trinta-e-dois-caracteres',
    META_APP_SECRET: 'segredo-do-aplicativo-com-mais-de-trinta-e-dois-caracteres',
  });
  assert.equal(environment.META_WEBHOOK_ENABLED, true);
});

test('download Meta exige token e versão explícita da Graph API', () => {
  assert.throws(() => readEnvironment({
    ...required,
    MEDIA_DOWNLOAD_ADAPTER: 'meta',
  }));
  assert.throws(() => readEnvironment({
    ...required,
    MEDIA_DOWNLOAD_ADAPTER: 'meta',
    META_ACCESS_TOKEN: 'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    META_GRAPH_API_VERSION: 'latest',
  }));

  const environment = readEnvironment({
    ...required,
    MEDIA_DOWNLOAD_ADAPTER: 'meta',
    META_ACCESS_TOKEN: 'token-meta-sintetico-com-mais-de-trinta-e-dois-caracteres',
    META_GRAPH_API_VERSION: 'v99.0',
  });
  assert.equal(environment.MEDIA_DOWNLOAD_ADAPTER, 'meta');
  assert.equal(environment.META_GRAPH_API_VERSION, 'v99.0');
});
