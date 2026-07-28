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

test('adapters externos permanecem desligados por padrão', () => {
  const environment = readEnvironment(required);
  assert.equal(environment.WHATSAPP_ADAPTER, 'disabled');
  assert.equal(environment.MEDIA_DOWNLOAD_ADAPTER, 'disabled');
  assert.equal(environment.MEDIA_ORPHAN_GRACE_HOURS, 24);
});

test('limita a janela de segurança para reconciliação de mídia órfã', () => {
  assert.throws(() => readEnvironment({
    ...required,
    MEDIA_ORPHAN_GRACE_HOURS: '0',
  }));
  assert.equal(readEnvironment({
    ...required,
    MEDIA_ORPHAN_GRACE_HOURS: '48',
  }).MEDIA_ORPHAN_GRACE_HOURS, 48);
});

test('habilita somente adapters implementados', () => {
  assert.equal(readEnvironment({
    ...required,
    WHATSAPP_ADAPTER: 'baileys',
  }).WHATSAPP_ADAPTER, 'baileys');
  assert.throws(() => readEnvironment({
    ...required,
    MEDIA_DOWNLOAD_ADAPTER: 'baileys',
  }));
});
