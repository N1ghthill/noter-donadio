export const AUDIT_ACTIONS = [
  'contact_created',
  'contact_updated',
  'contact_deleted',
  'contact_merged',
  'negotiation_created',
  'negotiation_updated',
  'negotiation_stage_changed',
  'negotiation_follow_up_completed',
  'analysis_accepted',
  'analysis_ignored',
  'workspace_exported',
  'whatsapp_auth_reset',
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

export interface WorkspaceAuditEvent {
  readonly id: string;
  readonly action: AuditAction;
  readonly actorDisplayName: string;
  readonly contactId: string | null;
  readonly negotiationId: string | null;
  readonly changedFields: readonly string[];
  readonly previousVersion: number | null;
  readonly resultingVersion: number | null;
  readonly details: {
    readonly previousStage?: string | undefined;
    readonly resultingStage?: string | undefined;
    readonly schemaVersion?: string | undefined;
    readonly mediaAssets?: number | undefined;
  };
  readonly createdAt: string;
}

export interface AuditLogRepository {
  list(input: {
    readonly workspaceId: string;
    readonly limit: number;
    readonly action?: AuditAction | undefined;
  }): Promise<readonly WorkspaceAuditEvent[]>;
}
