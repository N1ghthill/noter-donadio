import type { NegotiationStage } from '@noter/contracts';

export interface ContactView {
  readonly id: string;
  readonly displayName: string;
  readonly phoneNumber: string;
  readonly tags: readonly string[];
  readonly source: string;
  readonly status: string;
  readonly lastInteractionAt: string | null;
}

export interface NegotiationView {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly title: string | null;
  readonly stage: NegotiationStage;
  readonly value: string | null;
  readonly currency: string;
  readonly sentiment: string | null;
  readonly version: number;
  readonly updatedAt: string;
}

export class CrmNotFoundError extends Error {}
export class CrmConflictError extends Error {}

export interface CrmRepository {
  listContacts(workspaceId: string, search: string | undefined, limit: number): Promise<ContactView[]>;
  createContact(input: {
    workspaceId: string;
    displayName: string;
    phoneNumber: string;
    tags: readonly string[];
    notes?: string | undefined;
  }): Promise<ContactView>;
  listNegotiations(workspaceId: string, stage: NegotiationStage | undefined): Promise<NegotiationView[]>;
  updateNegotiationStage(input: {
    workspaceId: string;
    negotiationId: string;
    stage: NegotiationStage;
    expectedVersion: number;
  }): Promise<NegotiationView>;
}
