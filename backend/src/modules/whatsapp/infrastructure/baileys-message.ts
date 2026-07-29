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
  readonly messageType: 'audio';
  readonly mimeType?: string;
  readonly durationSeconds?: number;
  readonly mediaReference: BaileysMediaReference;
}

export interface BaileysMediaEvent {
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly fromMe: boolean;
  readonly phoneNumber: string;
  readonly displayName?: string;
  readonly occurredAt: Date;
  readonly messageType: 'audio' | 'image' | 'document';
  readonly caption?: string;
  readonly mimeType?: string;
  readonly originalFileName?: string;
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
    remoteJid: phoneJid,
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
  const event = toBaileysMediaEvent(message, (media) => createReference(
    media as proto.Message.IAudioMessage,
  ), resolvedPhoneJid);
  if (!event || event.messageType !== 'audio') return null;
  return { ...event, messageType: 'audio' };
}

export function toBaileysMediaEvent(
  message: WAMessage,
  createReference: (
    media: MediaMessage,
  ) => BaileysMediaReference | null,
  resolvedPhoneJid?: string,
): BaileysMediaEvent | null {
  const externalMessageId = message.key.id;
  const remoteJid = message.key.remoteJid;
  const content = extractMessageContent(message.message);
  const media = content?.audioMessage ?? content?.imageMessage ?? content?.documentMessage;
  const messageType = content?.audioMessage
    ? 'audio'
    : content?.imageMessage
      ? 'image'
      : content?.documentMessage
        ? 'document'
        : undefined;
  const phoneJid = phoneJidForMessage(message, resolvedPhoneJid);
  const occurredAt = toDate(message.messageTimestamp);
  const reference = media ? createReference(media) : null;

  if (
    typeof externalMessageId !== 'string'
    || typeof remoteJid !== 'string'
    || !phoneJid
    || !occurredAt
    || !media
    || !messageType
    || !reference
  ) return null;

  const mimeType = typeof media.mimetype === 'string' && media.mimetype.length <= 100
    ? media.mimetype
    : undefined;
  const durationSeconds = 'seconds' in media
    && Number.isInteger(media.seconds)
    && Number(media.seconds) >= 0
    ? Number(media.seconds)
    : undefined;
  const caption = 'caption' in media && typeof media.caption === 'string' && media.caption.trim()
    ? media.caption.trim()
    : undefined;
  const originalFileName = 'fileName' in media ? safeFileName(media.fileName) : undefined;
  return {
    externalMessageId,
    remoteJid: phoneJid,
    fromMe: message.key.fromMe === true,
    phoneNumber: phoneJid.slice(0, -'@s.whatsapp.net'.length),
    ...(message.pushName ? { displayName: message.pushName } : {}),
    occurredAt,
    messageType,
    ...(caption ? { caption } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(originalFileName ? { originalFileName } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    mediaReference: reference,
  };
}

type MediaMessage =
  | proto.Message.IAudioMessage
  | proto.Message.IImageMessage
  | proto.Message.IDocumentMessage;

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

function safeFileName(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    ?.split('').filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }).join('')
    .trim();
  return normalized ? normalized.slice(0, 255) : undefined;
}
