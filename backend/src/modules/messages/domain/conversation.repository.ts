import type { NegotiationStage } from '@noter/contracts';

export interface ConversationSummaryView {
  readonly negotiationId: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly stage: NegotiationStage;
  readonly lastMessage: {
    readonly id: string;
    readonly direction: 'inbound' | 'outbound';
    readonly messageType: string;
    readonly content: string | null;
    readonly occurredAt: string;
  };
}

export interface ConversationRepository {
  list(workspaceId: string, limit: number): Promise<ConversationSummaryView[]>;
}
