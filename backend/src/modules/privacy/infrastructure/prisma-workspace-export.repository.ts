import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ExportJsonObject,
  ExportJsonValue,
  WorkspaceExportDocument,
  WorkspaceExportRepository,
} from '../domain/workspace-export.js';

export class PrismaWorkspaceExportRepository implements WorkspaceExportRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async exportWorkspace(input: {
    workspaceId: string;
    userId: string;
    exportedAt: Date;
  }): Promise<WorkspaceExportDocument | null> {
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { id: true, slug: true, name: true, createdAt: true, updatedAt: true },
      });
      if (!workspace) return null;

      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: 'workspace_exported',
          details: { schemaVersion: 'workspace-export-v1' },
        },
      });

      const where = { workspaceId: input.workspaceId };
      const [users, whatsappAccounts, contacts, negotiations, followUpHistory, messages,
        mediaAssets, analyses, decisions, auditEvents] = await Promise.all([
        transaction.user.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, email: true, displayName: true, role: true, status: true,
          lastLoginAt: true, createdAt: true, updatedAt: true,
        } }),
        transaction.whatsappAccount.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, identifier: true, phoneNumber: true, connectionStatus: true,
          lastConnectedAt: true, createdAt: true, updatedAt: true,
        } }),
        transaction.contact.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, jid: true, phoneNumber: true, displayName: true, profilePictureUrl: true,
          tags: true, notes: true, source: true, status: true, metadata: true,
          lastInteractionAt: true, createdAt: true, updatedAt: true,
        } }),
        transaction.negotiation.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, contactId: true, title: true, stage: true, value: true,
          valueConfirmedAt: true, currency: true, expectedCloseDate: true,
          expectedCloseDateConfirmedAt: true, productInterest: true,
          productInterestConfirmedAt: true, nextAction: true, nextActionConfirmedAt: true,
          nextActionDueDate: true, nextActionDueDateConfirmedAt: true, lastSummary: true,
          sentiment: true, priority: true, pipelineStageOrder: true, metadata: true,
          closedAt: true, closeReason: true, version: true, createdAt: true, updatedAt: true,
        } }),
        transaction.negotiationFollowUpHistory.findMany({ where, orderBy: { completedAt: 'asc' }, select: {
          id: true, negotiationId: true, completedByUserId: true, description: true,
          dueDate: true, completedAt: true,
        } }),
        transaction.message.findMany({ where, orderBy: { occurredAt: 'asc' }, select: {
          id: true, whatsappAccountId: true, externalMessageId: true, contactId: true,
          negotiationId: true, direction: true, messageType: true, content: true,
          occurredAt: true, metadata: true, createdAt: true,
        } }),
        transaction.mediaAsset.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, messageId: true, fileSizeBytes: true, durationSeconds: true,
          mimeType: true, originalFileName: true,
          downloadState: true, downloadFailureCode: true,
          transcriptionState: true, transcriptionText: true, transcriptionConfidence: true,
          transcriptionLanguage: true, transcriptionModel: true, failureCode: true,
          retentionUntil: true, removedAt: true, transcribedAt: true, createdAt: true, updatedAt: true,
        } }),
        transaction.aiAnalysis.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, messageId: true, negotiationId: true, analysisType: true, state: true,
          summary: true, entities: true, sentiment: true, sentimentConfidence: true,
          objections: true, nextActions: true, suggestedTags: true, suggestedStage: true,
          confidenceScore: true, conversationContext: true, promptVersion: true,
          promptTokens: true, completionTokens: true,
          modelUsed: true, processingTimeMs: true, failureCode: true, createdAt: true, updatedAt: true,
        } }),
        transaction.analysisDecision.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, analysisId: true, negotiationId: true, userId: true, decision: true,
          appliedStage: true, appliedTags: true, appliedValue: true,
          appliedExpectedCloseDate: true, appliedProductInterest: true, appliedNextAction: true,
          appliedNextActionDueDate: true, resultingNegotiationVersion: true, createdAt: true,
        } }),
        transaction.auditEvent.findMany({ where, orderBy: { createdAt: 'asc' }, select: {
          id: true, userId: true, contactId: true, negotiationId: true, action: true,
          changedFields: true, previousVersion: true, resultingVersion: true,
          details: true, createdAt: true,
        } }),
      ]);

      return {
        schemaVersion: 'workspace-export-v1',
        exportedAt: input.exportedAt.toISOString(),
        workspace: {
          id: workspace.id,
          slug: workspace.slug,
          name: workspace.name,
          createdAt: workspace.createdAt.toISOString(),
          updatedAt: workspace.updatedAt.toISOString(),
        },
        data: asJsonObject({
          users, whatsappAccounts, contacts, negotiations, followUpHistory, messages,
          mediaAssets, analyses, decisions, auditEvents,
        }),
      } satisfies WorkspaceExportDocument;
    }, { isolationLevel: 'RepeatableRead' });
  }
}

function asJsonObject(value: object): ExportJsonObject {
  const normalized = normalizeJson(value);
  if (!isJsonObject(normalized)) {
    throw new TypeError('workspace_export_invalid');
  }
  return normalized;
}

function isJsonObject(value: ExportJsonValue): value is ExportJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeJson(value: unknown): ExportJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('workspace_export_invalid_number');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === 'object') {
    const toJson = Reflect.get(value, 'toJSON');
    if (typeof toJson === 'function') return normalizeJson(Reflect.apply(toJson, value, []));
    const output: Record<string, ExportJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) output[key] = normalizeJson(item);
    }
    return output;
  }
  throw new TypeError('workspace_export_unsupported_value');
}
