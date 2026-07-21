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
