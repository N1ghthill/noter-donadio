import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  AuditAction,
  AuditLogRepository,
  WorkspaceAuditEvent,
} from '../domain/audit-log.js';

export class PrismaAuditLogRepository implements AuditLogRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(input: {
    workspaceId: string;
    limit: number;
    action?: AuditAction | undefined;
  }): Promise<readonly WorkspaceAuditEvent[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.action ? { action: input.action } : {}),
      },
      select: {
        id: true,
        action: true,
        contactId: true,
        negotiationId: true,
        changedFields: true,
        previousVersion: true,
        resultingVersion: true,
        details: true,
        createdAt: true,
        user: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      actorDisplayName: event.user.displayName,
      contactId: event.contactId,
      negotiationId: event.negotiationId,
      changedFields: event.changedFields,
      previousVersion: event.previousVersion,
      resultingVersion: event.resultingVersion,
      details: sanitizeDetails(event.details),
      createdAt: event.createdAt.toISOString(),
    }));
  }
}

function sanitizeDetails(value: unknown): WorkspaceAuditEvent['details'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const details = value as Record<string, unknown>;
  return {
    ...(typeof details.previousStage === 'string' ? { previousStage: details.previousStage } : {}),
    ...(typeof details.resultingStage === 'string' ? { resultingStage: details.resultingStage } : {}),
    ...(details.schemaVersion === 'workspace-export-v1' ? { schemaVersion: details.schemaVersion } : {}),
    ...(typeof details.mediaAssets === 'number' && Number.isInteger(details.mediaAssets)
      ? { mediaAssets: details.mediaAssets }
      : {}),
  };
}
