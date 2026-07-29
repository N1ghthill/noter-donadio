import { z } from 'zod';

const workspaceId = z.uuid();

const eventSchemas = {
  'contact.updated': z.object({
    workspaceId,
    contactId: z.uuid(),
    changedFields: z.array(z.enum(['displayName', 'phoneNumber', 'tags', 'notes'])).max(4),
  }),
  'contact.deleted': z.object({
    workspaceId,
    contactId: z.uuid(),
  }),
  'negotiation.stage.changed': z.object({
    workspaceId,
    negotiationId: z.uuid(),
    stage: z.enum(['lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost']),
  }),
  'negotiation.created': z.object({
    workspaceId,
    negotiationId: z.uuid(),
    contactId: z.uuid(),
    stage: z.enum(['lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost']),
  }),
  'negotiation.updated': z.object({
    workspaceId,
    negotiationId: z.uuid(),
    changedFields: z.array(z.enum([
      'title', 'value', 'expectedCloseDate', 'productInterest', 'nextAction', 'nextActionDueDate',
    ])).max(6),
  }),
  'whatsapp.connection.changed': z.object({
    workspaceId,
    accountId: z.uuid(),
    status: z.enum(['disconnected', 'qr_generated', 'connecting', 'connected', 'timeout']),
  }),
  'message.persisted': z.object({
    workspaceId,
    messageId: z.uuid(),
    contactId: z.uuid(),
    negotiationId: z.uuid(),
  }),
  'message.media.available': z.object({
    workspaceId,
    messageId: z.uuid(),
    contactId: z.uuid(),
    negotiationId: z.uuid(),
  }),
  'message.transcription.changed': z.object({
    workspaceId,
    messageId: z.uuid(),
    negotiationId: z.uuid(),
    state: z.enum(['completed', 'failed']),
  }),
  'analysis.changed': z.object({
    workspaceId,
    analysisId: z.uuid(),
    messageId: z.uuid(),
    negotiationId: z.uuid(),
    state: z.enum(['completed', 'failed']),
  }),
  'analysis.decision.changed': z.object({
    workspaceId,
    decisionId: z.uuid(),
    analysisId: z.uuid(),
    negotiationId: z.uuid(),
    decision: z.enum(['accepted', 'ignored']),
  }),
} as const;

export type RealtimeEvent =
  | { type: 'contact.updated'; workspaceId: string; contactId: string; changedFields: string[] }
  | { type: 'contact.deleted'; workspaceId: string; contactId: string }
  | { type: 'negotiation.stage.changed'; workspaceId: string; negotiationId: string; stage: string }
  | { type: 'negotiation.created'; workspaceId: string; negotiationId: string; contactId: string; stage: string }
  | { type: 'negotiation.updated'; workspaceId: string; negotiationId: string; changedFields: string[] }
  | { type: 'whatsapp.connection.changed'; workspaceId: string; accountId: string; status: string }
  | { type: 'message.persisted'; workspaceId: string; messageId: string; contactId: string; negotiationId: string }
  | { type: 'message.media.available'; workspaceId: string; messageId: string; contactId: string; negotiationId: string }
  | { type: 'message.transcription.changed'; workspaceId: string; messageId: string; negotiationId: string; state: string }
  | { type: 'analysis.changed'; workspaceId: string; analysisId: string; messageId: string; negotiationId: string; state: string }
  | { type: 'analysis.decision.changed'; workspaceId: string; decisionId: string; analysisId: string; negotiationId: string; decision: string };

export function parseRealtimeEvent(name: string, data: unknown): RealtimeEvent {
  if (name === 'contact.updated') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'contact.deleted') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'negotiation.stage.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'negotiation.created') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'negotiation.updated') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'whatsapp.connection.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'message.persisted') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'message.media.available') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'message.transcription.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'analysis.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'analysis.decision.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  throw new Error('unsupported_realtime_event');
}
