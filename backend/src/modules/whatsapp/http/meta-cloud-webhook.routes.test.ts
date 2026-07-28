import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { buildApp } from '../../../app.js';
import {
  MetaCloudIngestionService,
  type MetaCloudMessageSink,
} from '../domain/meta-cloud-ingestion.js';

const APP_SECRET = 'segredo-sintetico-com-mais-de-trinta-e-dois-caracteres';
const VERIFY_TOKEN = 'token-sintetico-com-mais-de-trinta-e-dois-caracteres';

test('responde ao desafio somente com token válido', async (context) => {
  const app = createApp();
  context.after(async () => app.close());

  const valid = await app.inject({
    method: 'GET',
    url: `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
  });
  const invalid = await app.inject({
    method: 'GET',
    url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=12345',
  });

  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body, '12345');
  assert.match(valid.headers['content-type'] ?? '', /^text\/plain/);
  assert.equal(invalid.statusCode, 403);
});

test('valida assinatura no corpo bruto antes de interpretar JSON', async (context) => {
  let ingestionCalls = 0;
  const app = createApp(async () => {
    ingestionCalls += 1;
    return { duplicate: false };
  });
  context.after(async () => app.close());
  const rawBody = JSON.stringify(syntheticPayload('text'));

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/webhook',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(`${rawBody}alterado`),
    },
    payload: rawBody,
  });

  assert.equal(invalid.statusCode, 401);
  assert.equal(ingestionCalls, 0);
});

test('persiste texto assinado sem exigir Origin de navegador', async (context) => {
  const commands: unknown[] = [];
  const app = createApp(async (command) => {
    commands.push(command);
    return { duplicate: false };
  });
  context.after(async () => app.close());
  const rawBody = JSON.stringify(syntheticPayload('text'));

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/webhook',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(rawBody),
    },
    payload: rawBody,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { received: true });
  assert.equal(commands.length, 1);
});

test('mantém áudio indisponível até existir download pós-commit', async (context) => {
  let ingestionCalls = 0;
  const app = createApp(async () => {
    ingestionCalls += 1;
    return { duplicate: false };
  });
  context.after(async () => app.close());
  const rawBody = JSON.stringify(syntheticPayload('audio'));

  const response = await app.inject({
    method: 'POST',
    url: '/api/whatsapp/webhook',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(rawBody),
    },
    payload: rawBody,
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'temporarily_unavailable' });
  assert.equal(ingestionCalls, 0);
});

function createApp(
  ingest: MetaCloudMessageSink['ingest'] = async () => ({ duplicate: false }),
) {
  const ingestionService = new MetaCloudIngestionService(
    {
      async resolve() {
        return {
          workspaceId: '00000000-0000-4000-8000-000000000001',
          whatsappAccountId: '00000000-0000-4000-8000-000000000002',
        };
      },
    },
    { ingest },
  );
  return buildApp({
    allowedOrigins: ['https://app.example.test'],
    metaCloudWebhook: {
      appSecret: APP_SECRET,
      verifyToken: VERIFY_TOKEN,
      ingestionService,
    },
  });
}

function sign(rawBody: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
}

function syntheticPayload(type: 'text' | 'audio') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-synthetic',
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-synthetic' },
          contacts: [{
            wa_id: '5571000000101',
            profile: { name: 'Contato Fictício' },
          }],
          messages: [{
            from: '5571000000101',
            id: 'wamid.synthetic',
            timestamp: '1785214800',
            type,
            ...(type === 'text'
              ? { text: { body: 'Mensagem inteiramente fictícia.' } }
              : { audio: { id: 'media-synthetic', mime_type: 'audio/ogg' } }),
          }],
        },
      }],
    }],
  };
}
