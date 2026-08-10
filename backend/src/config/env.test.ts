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
  assert.equal(environment.NOTIFICATION_ADAPTER, 'disabled');
  assert.equal(environment.TRANSCRIPTION_FEATURE_ENABLED, false);
  assert.equal(environment.AI_ANALYSIS_FEATURE_ENABLED, false);
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
  assert.equal(readEnvironment({
    ...required,
    MEDIA_DOWNLOAD_ADAPTER: 'baileys',
  }).MEDIA_DOWNLOAD_ADAPTER, 'baileys');
  assert.equal(readEnvironment({
    ...required,
    TRANSCRIPTION_ADAPTER: 'openai',
    AI_ADAPTER: 'openai',
  }).AI_ADAPTER, 'openai');
  const groq = readEnvironment({
    ...required,
    TRANSCRIPTION_ADAPTER: 'groq',
    AI_ADAPTER: 'groq',
  });
  assert.equal(groq.TRANSCRIPTION_ADAPTER, 'groq');
  assert.equal(groq.AI_ADAPTER, 'groq');
  assert.equal(groq.GROQ_TRANSCRIPTION_MODEL, 'whisper-large-v3-turbo');
  assert.equal(groq.GROQ_ANALYSIS_MODEL, 'openai/gpt-oss-20b');
  assert.equal(readEnvironment({
    ...required,
    NOTIFICATION_ADAPTER: 'bark',
    BARK_WEBHOOK_URL: 'https://api.day.app/device-key',
  }).NOTIFICATION_ADAPTER, 'bark');
});

test('capacidades assistivas exigem ativação explícita', () => {
  const environment = readEnvironment({
    ...required,
    TRANSCRIPTION_FEATURE_ENABLED: 'true',
    AI_ANALYSIS_FEATURE_ENABLED: 'true',
  });
  assert.equal(environment.TRANSCRIPTION_FEATURE_ENABLED, true);
  assert.equal(environment.AI_ANALYSIS_FEATURE_ENABLED, true);
  assert.throws(() => readEnvironment({
    ...required,
    AI_ANALYSIS_FEATURE_ENABLED: 'yes',
  }));
});

test('valida limites e instante de corte do processamento externo', () => {
  const environment = readEnvironment({
    ...required,
    ASSISTIVE_PROCESSING_NOT_BEFORE: '2026-07-29T00:00:00Z',
    OPENAI_TIMEOUT_MS: '45000',
  });
  assert.equal(environment.ASSISTIVE_PROCESSING_NOT_BEFORE, '2026-07-29T00:00:00Z');
  assert.equal(environment.OPENAI_TIMEOUT_MS, 45_000);
  assert.throws(() => readEnvironment({
    ...required,
    ASSISTIVE_PROCESSING_NOT_BEFORE: 'ontem',
  }));
});

test('valida configuração temporal e URLs da notificação', () => {
  const environment = readEnvironment({
    ...required,
    NOTIFICATION_NOT_BEFORE: '2026-08-10T12:00:00-03:00',
    BARK_WEBHOOK_URL: 'https://api.day.app/device-key',
    BARK_TIMEOUT_MS: '5000',
  });
  assert.equal(environment.NOTIFICATION_NOT_BEFORE, '2026-08-10T12:00:00-03:00');
  assert.equal(environment.BARK_TIMEOUT_MS, 5_000);
  assert.throws(() => readEnvironment({ ...required, NOTIFICATION_NOT_BEFORE: 'agora' }));
  assert.throws(() => readEnvironment({ ...required, BARK_WEBHOOK_URL: 'não-é-url' }));
});
