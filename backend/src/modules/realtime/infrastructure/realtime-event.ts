import { z } from 'zod';

const workspaceId = z.uuid();

const eventSchemas = {
  'contact.updated': z.object({
    workspaceId,
    contactId: z.uuid(),
    changedFields: z.array(z.enum(['displayName', 'phoneNumber', 'tags', 'notes'])).max(4),
  }),
  'negotiation.stage.changed': z.object({
    workspaceId,
    negotiationId: z.uuid(),
    stage: z.enum(['lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost']),
  }),
  'whatsapp.connection.changed': z.object({
    workspaceId,
    accountId: z.uuid(),
    status: z.enum(['disconnected', 'qr_generated', 'connecting', 'connected', 'timeout']),
  }),
} as const;

export type RealtimeEvent =
  | { type: 'contact.updated'; workspaceId: string; contactId: string; changedFields: string[] }
  | { type: 'negotiation.stage.changed'; workspaceId: string; negotiationId: string; stage: string }
  | { type: 'whatsapp.connection.changed'; workspaceId: string; accountId: string; status: string };

export function parseRealtimeEvent(name: string, data: unknown): RealtimeEvent {
  if (name === 'contact.updated') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'negotiation.stage.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  if (name === 'whatsapp.connection.changed') {
    return { type: name, ...eventSchemas[name].parse(data) };
  }
  throw new Error('unsupported_realtime_event');
}
