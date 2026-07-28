import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeBaileysTextEvent } from './baileys-text-event.js';

const binding = {
  workspaceId: 'workspace-synthetic',
  whatsappAccountId: 'account-synthetic',
};

test('normaliza texto recebido sem aceitar identidade do evento externo', () => {
  assert.deepEqual(normalizeBaileysTextEvent(binding, {
    externalMessageId: 'message-inbound',
    remoteJid: '5571000000101@s.whatsapp.net',
    fromMe: false,
    phoneNumber: '5571000000101',
    displayName: 'Contato Fictício',
    text: 'Mensagem inteiramente fictícia.',
    occurredAt: new Date('2026-07-28T08:00:00.000Z'),
  }), {
    ...binding,
    externalMessageId: 'message-inbound',
    remoteJid: '5571000000101@s.whatsapp.net',
    phoneNumber: '5571000000101',
    displayName: 'Contato Fictício',
    direction: 'inbound',
    messageType: 'text',
    content: 'Mensagem inteiramente fictícia.',
    occurredAt: new Date('2026-07-28T08:00:00.000Z'),
    metadata: { source: 'baileys' },
  });
});

test('preserva direção enviada quando fromMe é verdadeiro', () => {
  const normalized = normalizeBaileysTextEvent(binding, {
    externalMessageId: 'message-outbound',
    remoteJid: '5571000000101@s.whatsapp.net',
    fromMe: true,
    phoneNumber: '5571000000101',
    text: 'Resposta fictícia enviada pelo usuário.',
    occurredAt: new Date('2026-07-28T08:01:00.000Z'),
  });

  assert.equal(normalized?.direction, 'outbound');
});

test('ignora grupos, status e eventos sem conteúdo aceito', () => {
  const base = {
    externalMessageId: 'message-ignored',
    fromMe: false,
    phoneNumber: '5571000000101',
    text: 'Mensagem fictícia.',
    occurredAt: new Date('2026-07-28T08:02:00.000Z'),
  };

  assert.equal(normalizeBaileysTextEvent(binding, {
    ...base,
    remoteJid: '120363000000000000@g.us',
  }), null);
  assert.equal(normalizeBaileysTextEvent(binding, {
    ...base,
    remoteJid: 'status@broadcast',
  }), null);
  assert.equal(normalizeBaileysTextEvent(binding, {
    ...base,
    remoteJid: '5571000000101@s.whatsapp.net',
    text: '',
  }), null);
});
