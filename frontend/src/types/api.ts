import type { NegotiationStage } from '@noter/contracts';

export interface SessionUser {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: 'admin';
}

export interface Contact {
  id: string;
  displayName: string;
  phoneNumber: string;
  tags: string[];
  source: string;
  status: string;
  notes: string | null;
  lastInteractionAt: string | null;
}

export interface Negotiation {
  id: string;
  contactId: string;
  contactName: string;
  title: string | null;
  stage: NegotiationStage;
  value: string | null;
  currency: string;
  sentiment: string | null;
  version: number;
  updatedAt: string;
}

export interface NegotiationDetail extends Negotiation {
  contact: Contact;
  messages: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    messageType: string;
    content: string | null;
    occurredAt: string;
    media: {
      transcriptionState: string;
      transcriptionText: string | null;
      durationSeconds: number | null;
      mimeType: string | null;
    } | null;
  }>;
  analyses: Array<{
    id: string;
    state: string;
    summary: string | null;
    sentiment: string | null;
    objections: string[];
    nextActions: string[];
    suggestedTags: string[];
    suggestedStage: NegotiationStage | null;
    confidenceScore: string | null;
    createdAt: string;
  }>;
}
