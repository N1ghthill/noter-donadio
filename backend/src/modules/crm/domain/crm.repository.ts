import type { NegotiationStage, ProcessingState } from '@noter/contracts';

export interface ContactView {
  readonly id: string;
  readonly displayName: string;
  readonly phoneNumber: string;
  readonly tags: readonly string[];
  readonly source: string;
  readonly status: string;
  readonly notes: string | null;
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

export interface NegotiationDetailView extends NegotiationView {
  readonly contact: ContactView;
  readonly messages: readonly {
    readonly id: string;
    readonly direction: 'inbound' | 'outbound';
    readonly messageType: string;
    readonly content: string | null;
    readonly occurredAt: string;
    readonly media: {
      readonly transcriptionState: string;
      readonly transcriptionText: string | null;
      readonly durationSeconds: number | null;
      readonly mimeType: string | null;
      readonly playbackAvailable: boolean;
    } | null;
  }[];
  readonly analyses: readonly {
    readonly id: string;
    readonly state: ProcessingState;
    readonly summary: string | null;
    readonly entities: {
      readonly product: string | null;
      readonly amount: string | null;
      readonly deadline: string | null;
    } | null;
    readonly sentiment: string | null;
    readonly objections: readonly string[];
    readonly nextActions: readonly string[];
    readonly suggestedTags: readonly string[];
    readonly suggestedStage: NegotiationStage | null;
    readonly confidenceScore: string | null;
    readonly promptVersion: string;
    readonly modelUsed: string | null;
    readonly createdAt: string;
    readonly decision: AnalysisDecisionView | null;
  }[];
  readonly auditTrail: readonly AuditEventView[];
}

export interface AuditEventView {
  readonly id: string;
  readonly action: 'contact_created' | 'contact_updated' | 'negotiation_stage_changed' | 'analysis_accepted' | 'analysis_ignored';
  readonly actorDisplayName: string;
  readonly changedFields: readonly string[];
  readonly previousVersion: number | null;
  readonly resultingVersion: number | null;
  readonly details: {
    readonly previousStage?: NegotiationStage | undefined;
    readonly resultingStage?: NegotiationStage | undefined;
  };
  readonly createdAt: string;
}

export interface AnalysisDecisionView {
  readonly id: string;
  readonly decision: 'accepted' | 'ignored';
  readonly appliedStage: NegotiationStage | null;
  readonly appliedTags: readonly string[];
  readonly resultingNegotiationVersion: number;
  readonly createdAt: string;
}

export class CrmNotFoundError extends Error {}
export class CrmConflictError extends Error {}
export class CrmDecisionConflictError extends Error {}
export class CrmTagLimitError extends Error {}

export interface CrmRepository {
  listContacts(workspaceId: string, search: string | undefined, limit: number): Promise<ContactView[]>;
  createContact(input: {
    workspaceId: string;
    userId: string;
    displayName: string;
    phoneNumber: string;
    tags: readonly string[];
    notes?: string | undefined;
  }): Promise<ContactView>;
  updateContact(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
    displayName?: string | undefined;
    phoneNumber?: string | undefined;
    tags?: readonly string[] | undefined;
    notes?: string | null | undefined;
  }): Promise<ContactView>;
  listNegotiations(workspaceId: string, stage: NegotiationStage | undefined): Promise<NegotiationView[]>;
  getNegotiation(workspaceId: string, negotiationId: string): Promise<NegotiationDetailView>;
  updateNegotiationStage(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    stage: NegotiationStage;
    expectedVersion: number;
  }): Promise<NegotiationView>;
  decideAnalysis(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    analysisId: string;
    decisionId: string;
    decision: 'accepted' | 'ignored';
    expectedVersion: number;
    stage?: NegotiationStage | undefined;
    tags?: readonly string[] | undefined;
  }): Promise<AnalysisDecisionView>;
}
