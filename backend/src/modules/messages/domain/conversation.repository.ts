import type { NegotiationStage, ProcessingState } from '@noter/contracts';

export interface ConversationListFilters {
  readonly limit: number;
  readonly offset: number;
  readonly startedFrom?: Date | undefined;
  readonly startedTo?: Date | undefined;
  readonly stage?: NegotiationStage | undefined;
  readonly aiStage?: NegotiationStage | undefined;
  readonly contactId?: string | undefined;
  readonly search?: string | undefined;
}

export interface ConversationSummaryView {
  readonly negotiationId: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly stage: NegotiationStage;
  readonly title: string | null;
  readonly firstMessageAt: string;
  readonly messageCount: number;
  readonly latestAnalysis: {
    readonly state: ProcessingState;
    readonly summary: string | null;
    readonly sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
    readonly suggestedStage: NegotiationStage | null;
    readonly suggestedTags: readonly string[];
    readonly interactionType: 'new_lead' | 'new_case' | 'continuation' | 'follow_up_response' | 'multiple_cases' | 'unclear' | null;
    readonly needsHumanReview: boolean;
    readonly createdAt: string;
  } | null;
  readonly lastMessage: {
    readonly id: string;
    readonly direction: 'inbound' | 'outbound';
    readonly messageType: string;
    readonly content: string | null;
    readonly occurredAt: string;
  };
}

export interface ConversationRepository {
  list(workspaceId: string, filters: ConversationListFilters): Promise<ConversationSummaryView[]>;
}
