import {
  extractMessageContent,
  jidNormalizedUser,
  type Contact,
  type MessageUpsertType,
  type WAMessage,
} from 'baileys';

import type { BaileysTextEvent } from '../domain/baileys-text-event.js';

export function toBaileysTextEvent(
  message: WAMessage,
  resolvedPhoneJid?: string,
): BaileysTextEvent | null {
  const externalMessageId = message.key.id;
  const remoteJid = message.key.remoteJid;
  const content = extractMessageContent(message.message);
  const text = content?.conversation ?? content?.extendedTextMessage?.text;
  const phoneJid = remoteJid?.endsWith('@s.whatsapp.net')
    ? remoteJid
    : message.key.remoteJidAlt?.endsWith('@s.whatsapp.net')
      ? message.key.remoteJidAlt
      : resolvedPhoneJid?.endsWith('@s.whatsapp.net')
        ? resolvedPhoneJid
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

export async function resolveBaileysPhoneJid(
  message: WAMessage,
  user: Contact | undefined,
  getPhoneForLid: (lid: string) => Promise<string | null>,
): Promise<string | undefined> {
  const remoteJid = message.key.remoteJid;
  if (!remoteJid?.endsWith('@lid')) return undefined;
  if (remoteJid === user?.lid) {
    if (user.phoneNumber?.endsWith('@s.whatsapp.net')) return user.phoneNumber;
    const normalizedUserJid = jidNormalizedUser(user.id);
    if (normalizedUserJid.endsWith('@s.whatsapp.net')) return normalizedUserJid;
  }
  const mapped = await getPhoneForLid(remoteJid);
  return mapped?.endsWith('@s.whatsapp.net') ? mapped : undefined;
}

export function shouldIngestBaileysUpsert(
  type: MessageUpsertType,
  message: WAMessage,
  connectedAt: Date | undefined,
): boolean {
  if (type === 'notify') return true;
  if (!connectedAt || message.key.fromMe !== true) return false;
  const occurredAt = toDate(message.messageTimestamp);
  return occurredAt !== null && occurredAt.getTime() >= connectedAt.getTime();
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
