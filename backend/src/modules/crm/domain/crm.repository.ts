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
  readonly aiSummary: string | null;
  readonly aiSuggestedStage: NegotiationStage | null;
  readonly aiSuggestedTags: readonly string[];
  readonly nextAction: string | null;
  readonly nextActionDueDate: string | null;
  readonly version: number;
  readonly updatedAt: string;
}

export interface NegotiationDetailView extends NegotiationView {
  readonly closeReason: string | null;
  readonly valueConfirmedAt: string | null;
  readonly expectedCloseDate: string | null;
  readonly expectedCloseDateConfirmedAt: string | null;
  readonly productInterest: string | null;
  readonly productInterestConfirmedAt: string | null;
  readonly nextActionConfirmedAt: string | null;
  readonly nextActionDueDateConfirmedAt: string | null;
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
      readonly fileName: string | null;
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
  readonly followUpHistory: readonly {
    readonly id: string;
    readonly description: string;
    readonly dueDate: string | null;
    readonly completedAt: string;
    readonly completedByDisplayName: string;
  }[];
}

export interface AuditEventView {
  readonly id: string;
  readonly action: 'contact_created' | 'contact_updated' | 'contact_deleted' | 'negotiation_created' | 'negotiation_updated' | 'negotiation_stage_changed' | 'negotiation_follow_up_completed' | 'analysis_accepted' | 'analysis_ignored' | 'workspace_exported' | 'whatsapp_auth_reset';
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
  readonly appliedValue: string | null;
  readonly appliedExpectedCloseDate: string | null;
  readonly appliedProductInterest: string | null;
  readonly appliedNextAction: string | null;
  readonly appliedNextActionDueDate: string | null;
  readonly resultingNegotiationVersion: number;
  readonly createdAt: string;
}

export class CrmNotFoundError extends Error {}
export class CrmConflictError extends Error {}
export class CrmDecisionConflictError extends Error {}
export class CrmTagLimitError extends Error {}
export class CrmCloseReasonRequiredError extends Error {}
export class CrmNoNextActionError extends Error {}

export interface NegotiationListFilters {
  readonly stage?: NegotiationStage | undefined;
  readonly followUp?: 'overdue' | 'today' | 'upcoming' | 'missing' | undefined;
  readonly activeOnly?: boolean | undefined;
  readonly search?: string | undefined;
  readonly limit: number;
}

export interface DashboardView {
  readonly periodDays: 30 | 90 | 365;
  readonly contactsCount: number;
  readonly activeNegotiationsCount: number;
  readonly pipelineValue: string;
  readonly overdueFollowUpsCount: number;
  readonly todayFollowUpsCount: number;
  readonly missingFollowUpsCount: number;
  readonly wonCount: number;
  readonly lostCount: number;
  readonly winRatePercent: string | null;
  readonly stages: readonly {
    readonly stage: NegotiationStage;
    readonly count: number;
    readonly value: string;
  }[];
  readonly recentNegotiations: readonly NegotiationView[];
}

export interface CrmRepository {
  getDashboard(workspaceId: string, periodDays: 30 | 90 | 365): Promise<DashboardView>;
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
  listNegotiations(workspaceId: string, filters: NegotiationListFilters): Promise<NegotiationView[]>;
  createNegotiation(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
    title?: string | undefined;
    stage: NegotiationStage;
    value?: string | undefined;
    currency: 'BRL';
    expectedCloseDate?: string | undefined;
    productInterest?: string | undefined;
    nextAction?: string | undefined;
    nextActionDueDate?: string | undefined;
  }): Promise<NegotiationView>;
  getNegotiation(workspaceId: string, negotiationId: string): Promise<NegotiationDetailView>;
  updateNegotiation(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    expectedVersion: number;
    title?: string | null | undefined;
    value?: string | null | undefined;
    expectedCloseDate?: string | null | undefined;
    productInterest?: string | null | undefined;
    nextAction?: string | null | undefined;
    nextActionDueDate?: string | null | undefined;
  }): Promise<NegotiationView>;
  updateNegotiationStage(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    stage: NegotiationStage;
    expectedVersion: number;
    closeReason?: string | undefined;
  }): Promise<NegotiationView>;
  completeNextAction(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
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
    value?: string | undefined;
    expectedCloseDate?: string | undefined;
    productInterest?: string | undefined;
    nextAction?: string | undefined;
    nextActionDueDate?: string | undefined;
  }): Promise<AnalysisDecisionView>;
}
