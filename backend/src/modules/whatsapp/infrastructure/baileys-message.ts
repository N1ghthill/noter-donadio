import {
  extractMessageContent,
  type WAMessage,
} from 'baileys';

import type { BaileysTextEvent } from '../domain/baileys-text-event.js';

export function toBaileysTextEvent(message: WAMessage): BaileysTextEvent | null {
  const externalMessageId = message.key.id;
  const remoteJid = message.key.remoteJid;
  const content = extractMessageContent(message.message);
  const text = content?.conversation ?? content?.extendedTextMessage?.text;
  const phoneJid = remoteJid?.endsWith('@s.whatsapp.net')
    ? remoteJid
    : message.key.remoteJidAlt?.endsWith('@s.whatsapp.net')
      ? message.key.remoteJidAlt
      : undefined;
  const occurredAt = toDate(message.messageTimestamp);

  if (
    typeof externalMessageId !== 'string'
    || typeof remoteJid !== 'string'
    || typeof text !== 'string'
    || !text.trim()
    || !phoneJid
    || !occurredAt
  ) return null;

  return {
    externalMessageId,
    remoteJid,
    fromMe: message.key.fromMe === true,
    phoneNumber: phoneJid.slice(0, -'@s.whatsapp.net'.length),
    ...(message.pushName ? { displayName: message.pushName } : {}),
    text,
    occurredAt,
  };
}

function toDate(value: WAMessage['messageTimestamp']): Date | null {
  if (value === null || value === undefined) return null;
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1_000);
}
