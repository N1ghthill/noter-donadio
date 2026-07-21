import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRealtimeEvent } from './realtime-event.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';

test('evento em tempo real preserva somente campos permitidos', () => {
  const event = parseRealtimeEvent('contact.updated', {
    workspaceId: WORKSPACE_ID,
    contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
    changedFields: ['notes'],
    notes: 'conteúdo que não pode atravessar o evento',
    phoneNumber: '5571999999999',
  });
  assert.deepEqual(event, {
    type: 'contact.updated',
    workspaceId: WORKSPACE_ID,
    contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
    changedFields: ['notes'],
  });
});

test('evento desconhecido é recusado', () => {
  assert.throws(() => parseRealtimeEvent('message.content.exposed', {}), /unsupported_realtime_event/);
});

test('evento de conexão nunca transporta QR', () => {
  const event = parseRealtimeEvent('whatsapp.connection.changed', {
    workspaceId: WORKSPACE_ID,
    accountId: '2f31a180-6127-48cd-82da-7b324e49a31d',
    status: 'qr_generated',
    qrCode: 'conteúdo efêmero proibido',
  });
  assert.deepEqual(event, {
    type: 'whatsapp.connection.changed',
    workspaceId: WORKSPACE_ID,
    accountId: '2f31a180-6127-48cd-82da-7b324e49a31d',
    status: 'qr_generated',
  });
});

test('evento de mensagem transporta somente identificadores para reconciliação', () => {
  const event = parseRealtimeEvent('message.persisted', {
    workspaceId: WORKSPACE_ID,
    messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
    contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
    negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
    content: 'conteúdo que não pode atravessar o evento',
    phoneNumber: '5571999999999',
  });
  assert.deepEqual(event, {
    type: 'message.persisted',
    workspaceId: WORKSPACE_ID,
    messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
    contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
    negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
  });
});
