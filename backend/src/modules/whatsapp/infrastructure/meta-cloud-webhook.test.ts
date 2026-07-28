import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  InvalidMetaWebhookPayloadError,
  normalizeMetaWebhookPayload,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from './meta-cloud-webhook.js';

const APP_SECRET = 'segredo-sintetico-com-mais-de-trinta-e-dois-caracteres';
const VERIFY_TOKEN = 'token-sintetico-com-mais-de-trinta-e-dois-caracteres';

test('valida a assinatura sobre os bytes originais e recusa alteração', () => {
  const rawBody = Buffer.from('{"texto":"mensagem sintética com acentuação"}', 'utf8');
  const signature = `sha256=${createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;

  assert.equal(verifyMetaWebhookSignature(rawBody, signature, APP_SECRET), true);
  assert.equal(
    verifyMetaWebhookSignature(Buffer.from('{"texto":"alterada"}'), signature, APP_SECRET),
    false,
  );
  assert.equal(verifyMetaWebhookSignature(rawBody, undefined, APP_SECRET), false);
  assert.equal(verifyMetaWebhookSignature(rawBody, 'sha256=inválida', APP_SECRET), false);
});

test('retorna o desafio somente para modo e token válidos', () => {
  const query = {
    'hub.mode': 'subscribe',
    'hub.verify_token': VERIFY_TOKEN,
    'hub.challenge': '123456789',
  };

  assert.equal(verifyMetaWebhookChallenge(query, VERIFY_TOKEN), '123456789');
  assert.equal(
    verifyMetaWebhookChallenge({ ...query, 'hub.verify_token': 'outro-token-seguro'.repeat(3) }, VERIFY_TOKEN),
    null,
  );
  assert.equal(verifyMetaWebhookChallenge({ ...query, 'hub.mode': 'unsubscribe' }, VERIFY_TOKEN), null);
});

test('normaliza texto e áudio em lote sem transportar o payload original', () => {
  const messages = normalizeMetaWebhookPayload(syntheticPayload([
    {
      from: '5571000000101',
      id: 'wamid.synthetic-text',
      timestamp: '1785213000',
      type: 'text',
      text: { body: 'Conteúdo inteiramente fictício.' },
    },
    {
      from: '5571000000102',
      id: 'wamid.synthetic-audio',
      timestamp: '1785213001',
      type: 'audio',
      audio: { id: 'media-synthetic-1', mime_type: 'audio/ogg' },
    },
  ]));

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    provider: 'meta_cloud_api',
    businessAccountId: 'waba-synthetic',
    phoneNumberId: 'phone-number-synthetic',
    externalMessageId: 'wamid.synthetic-text',
    remoteJid: '5571000000101@s.whatsapp.net',
    phoneNumber: '5571000000101',
    displayName: 'Contato Fictício A',
    direction: 'inbound',
    messageType: 'text',
    content: 'Conteúdo inteiramente fictício.',
    occurredAt: new Date('2026-07-28T04:30:00.000Z'),
  });
  assert.equal(messages[1]?.messageType, 'audio');
  assert.equal(messages[1]?.providerMediaId, 'media-synthetic-1');
  assert.equal(messages[1]?.mediaMimeType, 'audio/ogg');
  assert.equal('rawPayload' in (messages[0] ?? {}), false);
});

test('ignora status e tipos ainda não aceitos pelo MVP', () => {
  const payload = syntheticPayload([{
    from: '5571000000101',
    id: 'wamid.synthetic-image',
    timestamp: '1785213000',
    type: 'image',
    image: { id: 'image-synthetic-1' },
  }], [{ id: 'wamid.synthetic-status', status: 'delivered' }]);

  assert.deepEqual(normalizeMetaWebhookPayload(payload), []);
});

test('recusa envelope e mensagem suportada fora do contrato', () => {
  assert.throws(
    () => normalizeMetaWebhookPayload({ object: 'page', entry: [] }),
    InvalidMetaWebhookPayloadError,
  );
  assert.throws(
    () => normalizeMetaWebhookPayload(syntheticPayload([{
      from: '5571000000101',
      id: 'wamid.synthetic-invalid',
      timestamp: '1785213000',
      type: 'text',
      text: {},
    }])),
    InvalidMetaWebhookPayloadError,
  );
});

function syntheticPayload(messages: unknown[], statuses?: unknown[]) {
  return {
    object: 'whatsapp_business_account' as const,
    entry: [{
      id: 'waba-synthetic',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5500000000000',
            phone_number_id: 'phone-number-synthetic',
          },
          contacts: [
            { wa_id: '5571000000101', profile: { name: 'Contato Fictício A' } },
            { wa_id: '5571000000102', profile: { name: 'Contato Fictício B' } },
          ],
          messages,
          ...(statuses ? { statuses } : {}),
        },
      }],
    }],
  };
}
