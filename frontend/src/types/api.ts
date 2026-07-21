import type { NegotiationStage, ProcessingState } from '@noter/contracts';
import type { WhatsappConnectionStatus } from '@noter/contracts';

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
      transcriptionState: ProcessingState;
      transcriptionText: string | null;
      durationSeconds: number | null;
      mimeType: string | null;
    } | null;
  }>;
  analyses: Array<{
    id: string;
    state: ProcessingState;
    summary: string | null;
    entities: {
      product: string | null;
      amount: string | null;
      deadline: string | null;
    } | null;
    sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
    objections: string[];
    nextActions: string[];
    suggestedTags: string[];
    suggestedStage: NegotiationStage | null;
    confidenceScore: string | null;
    promptVersion: string;
    modelUsed: string | null;
    createdAt: string;
  }>;
}

export interface WhatsappConnection {
  accountId: string | null;
  status: WhatsappConnectionStatus;
  phoneNumber: string | null;
  updatedAt: string | null;
  qrCode: { payload: string; expiresAt: string } | null;
  adapter: 'fake';
  canSimulate: true;
}

export interface ConversationSummary {
  negotiationId: string;
  contactId: string;
  contactName: string;
  stage: NegotiationStage;
  lastMessage: {
    id: string;
    direction: 'inbound' | 'outbound';
    messageType: string;
    content: string | null;
    occurredAt: string;
  };
}
