import {
  extractMessageContent,
  jidNormalizedUser,
  type Contact,
  type MessageUpsertType,
  type WAMessage,
  type proto,
} from 'baileys';

import type { BaileysTextEvent } from '../domain/baileys-text-event.js';
import type { BaileysMediaReference } from './baileys-media-reference.js';

export interface BaileysAudioEvent {
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly fromMe: boolean;
  readonly phoneNumber: string;
  readonly displayName?: string;
  readonly occurredAt: Date;
  readonly mimeType?: string;
  readonly durationSeconds?: number;
  readonly mediaReference: BaileysMediaReference;
}

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

export function toBaileysAudioEvent(
  message: WAMessage,
  createReference: (
    audio: proto.Message.IAudioMessage,
  ) => BaileysMediaReference | null,
  resolvedPhoneJid?: string,
): BaileysAudioEvent | null {
  const externalMessageId = message.key.id;
  const remoteJid = message.key.remoteJid;
  const content = extractMessageContent(message.message);
  const audio = content?.audioMessage;
  const phoneJid = phoneJidForMessage(message, resolvedPhoneJid);
  const occurredAt = toDate(message.messageTimestamp);
  const reference = audio ? createReference(audio) : null;

  if (
    typeof externalMessageId !== 'string'
    || typeof remoteJid !== 'string'
    || !phoneJid
    || !occurredAt
    || !audio
    || !reference
  ) return null;

  const mimeType = typeof audio.mimetype === 'string' && audio.mimetype.length <= 100
    ? audio.mimetype
    : undefined;
  const durationSeconds = Number.isInteger(audio.seconds) && Number(audio.seconds) >= 0
    ? Number(audio.seconds)
    : undefined;
  return {
    externalMessageId,
    remoteJid,
    fromMe: message.key.fromMe === true,
    phoneNumber: phoneJid.slice(0, -'@s.whatsapp.net'.length),
    ...(message.pushName ? { displayName: message.pushName } : {}),
    occurredAt,
    ...(mimeType ? { mimeType } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    mediaReference: reference,
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

function phoneJidForMessage(
  message: WAMessage,
  resolvedPhoneJid?: string,
): string | undefined {
  const remoteJid = message.key.remoteJid;
  return remoteJid?.endsWith('@s.whatsapp.net')
    ? remoteJid
    : message.key.remoteJidAlt?.endsWith('@s.whatsapp.net')
      ? message.key.remoteJidAlt
      : resolvedPhoneJid?.endsWith('@s.whatsapp.net')
        ? resolvedPhoneJid
        : undefined;
}
