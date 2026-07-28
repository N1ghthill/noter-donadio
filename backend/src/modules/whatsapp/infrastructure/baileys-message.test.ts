import assert from 'node:assert/strict';
import test from 'node:test';

import type { WAMessage } from 'baileys';

import { toBaileysTextEvent } from './baileys-message.js';

test('adapta texto novo do Baileys sem carregar o envelope externo adiante', () => {
  const event = toBaileysTextEvent({
    key: {
      id: 'synthetic-message',
      remoteJid: '5571000000101@s.whatsapp.net',
      fromMe: false,
    },
    pushName: 'Contato Sintético',
    messageTimestamp: 1_785_235_200,
    message: { extendedTextMessage: { text: 'Mensagem fictícia.' } },
  } as WAMessage);

  assert.deepEqual(event, {
    externalMessageId: 'synthetic-message',
    remoteJid: '5571000000101@s.whatsapp.net',
    fromMe: false,
    phoneNumber: '5571000000101',
    displayName: 'Contato Sintético',
    text: 'Mensagem fictícia.',
    occurredAt: new Date('2026-07-28T10:40:00.000Z'),
  });
});

test('usa JID alternativo telefônico para conversa identificada por LID', () => {
  const event = toBaileysTextEvent({
    key: {
      id: 'synthetic-lid-message',
      remoteJid: '123456789012345@lid',
      remoteJidAlt: '5571000000101@s.whatsapp.net',
    },
    messageTimestamp: 1_785_235_200,
    message: { conversation: 'Mensagem fictícia.' },
  } as WAMessage);

  assert.equal(event?.remoteJid, '123456789012345@lid');
  assert.equal(event?.phoneNumber, '5571000000101');
});

test('ignora protocolo, mídia e LID sem identidade telefônica resolvida', () => {
  const base = {
    key: { id: 'synthetic-ignored', remoteJid: '123456789012345@lid' },
    messageTimestamp: 1_785_235_200,
  } as WAMessage;
  assert.equal(toBaileysTextEvent(base), null);
  assert.equal(toBaileysTextEvent({
    ...base,
    message: { audioMessage: { url: 'https://invalid.example.test/audio' } },
  } as WAMessage), null);
});
