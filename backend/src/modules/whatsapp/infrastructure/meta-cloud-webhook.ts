import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import { z } from 'zod';

import type { MetaCloudInboundMessage } from '../domain/meta-cloud-ingestion.js';

const signaturePattern = /^sha256=([a-f0-9]{64})$/;
const digitsPattern = /^\d{8,20}$/;
const timestampPattern = /^\d{1,13}$/;

const verificationSchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string().min(1).max(512),
  'hub.challenge': z.string().min(1).max(512),
}).strict();

const envelopeSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    changes: z.array(z.object({
      field: z.string().trim().min(1).max(100),
      value: z.unknown(),
    })).max(1_000),
  })).max(1_000),
}).strict();

const messagesValueSchema = z.object({
  metadata: z.object({
    phone_number_id: z.string().trim().min(1).max(255),
  }),
  contacts: z.array(z.object({
    wa_id: z.string().regex(digitsPattern),
    profile: z.object({
      name: z.string().trim().min(1).max(255),
    }).optional(),
  })).max(1_000).optional(),
  messages: z.array(z.unknown()).max(1_000).optional(),
});

const baseMessageSchema = z.object({
  from: z.string().regex(digitsPattern),
  id: z.string().trim().min(1).max(255),
  timestamp: z.string().regex(timestampPattern),
  type: z.string().trim().min(1).max(100),
});

const textMessageSchema = baseMessageSchema.extend({
  type: z.literal('text'),
  text: z.object({
    body: z.string().min(1).max(100_000),
  }),
});

const audioMessageSchema = baseMessageSchema.extend({
  type: z.literal('audio'),
  audio: z.object({
    id: z.string().trim().min(1).max(255),
    mime_type: z.string().trim().min(1).max(255).optional(),
  }),
});

export class InvalidMetaWebhookPayloadError extends Error {
  public constructor() {
    super('Payload da Meta inválido');
    this.name = 'InvalidMetaWebhookPayloadError';
  }
}

export function verifyMetaWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  const match = signatureHeader?.match(signaturePattern);
  if (!match || appSecret.length < 32) return false;

  const supplied = Buffer.from(match[1]!, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function verifyMetaWebhookChallenge(
  query: unknown,
  expectedToken: string,
): string | null {
  if (expectedToken.length < 32) return null;
  const parsed = verificationSchema.safeParse(query);
  if (!parsed.success || !secureTextEquals(parsed.data['hub.verify_token'], expectedToken)) {
    return null;
  }
  return parsed.data['hub.challenge'];
}

export function normalizeMetaWebhookPayload(payload: unknown): readonly MetaCloudInboundMessage[] {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) throw new InvalidMetaWebhookPayloadError();

  const normalized: MetaCloudInboundMessage[] = [];
  for (const entry of envelope.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = messagesValueSchema.safeParse(change.value);
      if (!value.success) throw new InvalidMetaWebhookPayloadError();

      const contactNames = new Map(
        (value.data.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name]),
      );
      for (const rawMessage of value.data.messages ?? []) {
        const base = baseMessageSchema.safeParse(rawMessage);
        if (!base.success) throw new InvalidMetaWebhookPayloadError();
        if (base.data.type === 'text') {
          const message = textMessageSchema.safeParse(rawMessage);
          if (!message.success) throw new InvalidMetaWebhookPayloadError();
          normalized.push({
            ...commonMessage(entry.id, value.data.metadata.phone_number_id, message.data, contactNames),
            messageType: 'text',
            content: message.data.text.body,
          });
        } else if (base.data.type === 'audio') {
          const message = audioMessageSchema.safeParse(rawMessage);
          if (!message.success) throw new InvalidMetaWebhookPayloadError();
          normalized.push({
            ...commonMessage(entry.id, value.data.metadata.phone_number_id, message.data, contactNames),
            messageType: 'audio',
            providerMediaId: message.data.audio.id,
            ...(message.data.audio.mime_type ? { mediaMimeType: message.data.audio.mime_type } : {}),
          });
        }
      }
    }
  }
  return normalized;
}

function commonMessage(
  businessAccountId: string,
  phoneNumberId: string,
  message: z.infer<typeof baseMessageSchema>,
  contactNames: ReadonlyMap<string, string | undefined>,
) {
  const occurredAt = new Date(Number(message.timestamp) * 1_000);
  if (Number.isNaN(occurredAt.getTime())) throw new InvalidMetaWebhookPayloadError();
  const displayName = contactNames.get(message.from);
  return {
    provider: 'meta_cloud_api' as const,
    businessAccountId,
    phoneNumberId,
    externalMessageId: message.id,
    remoteJid: `${message.from}@s.whatsapp.net` as const,
    phoneNumber: message.from,
    ...(displayName ? { displayName } : {}),
    direction: 'inbound' as const,
    occurredAt,
  };
}

function secureTextEquals(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}
