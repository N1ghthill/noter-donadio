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
