import type { NegotiationStage, ProcessingState } from '@noter/contracts';
import type { WhatsappConnectionStatus } from '@noter/contracts';

export interface SessionUser {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: 'admin';
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
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
  aiSummary: string | null;
  aiSuggestedStage: NegotiationStage | null;
  aiSuggestedTags: string[];
  nextAction: string | null;
  nextActionDueDate: string | null;
  version: number;
  updatedAt: string;
}

export interface NegotiationDetail extends Negotiation {
  closeReason: string | null;
  valueConfirmedAt: string | null;
  expectedCloseDate: string | null;
  expectedCloseDateConfirmedAt: string | null;
  productInterest: string | null;
  productInterestConfirmedAt: string | null;
  nextActionConfirmedAt: string | null;
  nextActionDueDateConfirmedAt: string | null;
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
      fileName: string | null;
      playbackAvailable: boolean;
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
    decision: AnalysisDecision | null;
  }>;
  auditTrail: AuditEvent[];
  followUpHistory: Array<{
    id: string;
    description: string;
    dueDate: string | null;
    completedAt: string;
    completedByDisplayName: string;
  }>;
}

export interface Dashboard {
  periodDays: 30 | 90 | 365;
  contactsCount: number;
  activeNegotiationsCount: number;
  pipelineValue: string;
  overdueFollowUpsCount: number;
  todayFollowUpsCount: number;
  missingFollowUpsCount: number;
  wonCount: number;
  lostCount: number;
  winRatePercent: string | null;
  stages: Array<{ stage: NegotiationStage; count: number; value: string }>;
  recentNegotiations: Negotiation[];
}

export interface AuditEvent {
  id: string;
  action: 'contact_created' | 'contact_updated' | 'contact_deleted' | 'negotiation_created' | 'negotiation_updated' | 'negotiation_stage_changed' | 'negotiation_follow_up_completed' | 'analysis_accepted' | 'analysis_ignored' | 'workspace_exported' | 'whatsapp_auth_reset';
  actorDisplayName: string;
  changedFields: string[];
  previousVersion: number | null;
  resultingVersion: number | null;
  details: {
    previousStage?: NegotiationStage;
    resultingStage?: NegotiationStage;
  };
  createdAt: string;
}

export interface WorkspaceAuditEvent extends AuditEvent {
  contactId: string | null;
  negotiationId: string | null;
  details: AuditEvent['details'] & {
    schemaVersion?: string;
    mediaAssets?: number;
  };
}

export interface AnalysisDecision {
  id: string;
  decision: 'accepted' | 'ignored';
  appliedStage: NegotiationStage | null;
  appliedTags: string[];
  appliedValue: string | null;
  appliedExpectedCloseDate: string | null;
  appliedProductInterest: string | null;
  appliedNextAction: string | null;
  appliedNextActionDueDate: string | null;
  resultingNegotiationVersion: number;
  createdAt: string;
}

export interface WhatsappConnection {
  accountId: string | null;
  status: WhatsappConnectionStatus;
  phoneNumber: string | null;
  updatedAt: string | null;
  qrCode: { payload: string; expiresAt: string } | null;
  adapter: 'fake' | 'baileys';
  canSimulate: boolean;
}

export interface ProductCapabilities {
  demoSimulationEnabled: boolean;
  audioTranscriptionEnabled: boolean;
  messageAnalysisEnabled: boolean;
}

export interface ConversationSummary {
  negotiationId: string;
  contactId: string;
  contactName: string;
  stage: NegotiationStage;
  title: string | null;
  firstMessageAt: string;
  messageCount: number;
  latestAnalysis: {
    state: ProcessingState;
    summary: string | null;
    sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
    suggestedStage: NegotiationStage | null;
    suggestedTags: string[];
    createdAt: string;
  } | null;
  lastMessage: {
    id: string;
    direction: 'inbound' | 'outbound';
    messageType: string;
    content: string | null;
    occurredAt: string;
  };
}

export interface ContactFile {
  messageId: string;
  contactId: string;
  contactName: string;
  negotiationId: string | null;
  messageType: 'audio' | 'image' | 'document';
  direction: 'inbound' | 'outbound';
  fileName: string;
  mimeType: string;
  fileSizeBytes: string | null;
  durationSeconds: number | null;
  transcriptionState: ProcessingState;
  caption: string | null;
  occurredAt: string;
}
