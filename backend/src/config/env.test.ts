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
