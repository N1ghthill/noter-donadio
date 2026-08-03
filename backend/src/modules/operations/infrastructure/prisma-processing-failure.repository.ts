import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ProcessingFailure,
  ProcessingFailureRepository,
  ProcessingRetryResult,
} from '../domain/processing-retry.js';

export class PrismaProcessingFailureRepository implements ProcessingFailureRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(workspaceId: string, limit: number, notBefore: Date): Promise<readonly ProcessingFailure[]> {
    const [analyses, media] = await Promise.all([
      this.prisma.aiAnalysis.findMany({
        where: { workspaceId, state: 'failed' },
        select: {
          id: true, messageId: true, negotiationId: true, failureCode: true, updatedAt: true,
          message: { select: { createdAt: true, contact: { select: { displayName: true } } } },
        },
        orderBy: { updatedAt: 'desc' }, take: limit,
      }),
      this.prisma.mediaAsset.findMany({
        where: { workspaceId, transcriptionState: 'failed' },
        select: {
          id: true, messageId: true, failureCode: true, updatedAt: true,
          message: {
            select: { createdAt: true, negotiationId: true, contact: { select: { displayName: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' }, take: limit,
      }),
    ]);
    return [
      ...analyses.map((item): ProcessingFailure => ({
        id: item.id, kind: 'analysis', messageId: item.messageId,
        negotiationId: item.negotiationId, contactName: item.message.contact.displayName,
        failureCode: item.failureCode ?? 'ANALYSIS_PROCESSING_FAILED',
        failedAt: item.updatedAt.toISOString(), retryEligible: item.message.createdAt >= notBefore,
      })),
      ...media.flatMap((item): ProcessingFailure[] => item.message.negotiationId ? [{
        id: item.id, kind: 'transcription', messageId: item.messageId,
        negotiationId: item.message.negotiationId, contactName: item.message.contact.displayName,
        failureCode: item.failureCode ?? 'TRANSCRIPTION_PROCESSING_FAILED',
        failedAt: item.updatedAt.toISOString(), retryEligible: item.message.createdAt >= notBefore,
      }] : []),
    ].sort((a, b) => b.failedAt.localeCompare(a.failedAt)).slice(0, limit);
  }

  public async requestRetry(input: Parameters<ProcessingFailureRepository['requestRetry']>[0]): Promise<ProcessingRetryResult> {
    return this.prisma.$transaction(async (transaction) => {
      const message = await transaction.message.findFirst({
        where: { id: input.messageId, workspaceId: input.workspaceId },
        select: {
          id: true, createdAt: true, messageType: true, negotiationId: true,
          mediaAsset: { select: { transcriptionState: true, downloadState: true, storageKey: true } },
        },
      });
      if (!message?.negotiationId) return 'missing';
      if (message.createdAt < input.notBefore) return 'ineligible';

      let eventType: 'message.text.ingested' | 'message.audio.ready_for_analysis' | 'message.audio.ingested';
      if (input.kind === 'analysis') {
        if (message.messageType === 'audio' && message.mediaAsset?.transcriptionState !== 'completed') {
          return 'ineligible';
        }
        const updated = await transaction.aiAnalysis.updateMany({
          where: { workspaceId: input.workspaceId, messageId: input.messageId, state: 'failed' },
          data: { state: 'pending', failureCode: null, analysisAttemptId: null, processingStartedAt: null },
        });
        if (updated.count === 0) return 'not_failed';
        eventType = message.messageType === 'audio'
          ? 'message.audio.ready_for_analysis'
          : 'message.text.ingested';
      } else {
        if (message.messageType !== 'audio'
          || message.mediaAsset?.downloadState !== 'completed'
          || !message.mediaAsset.storageKey) return 'ineligible';
        const updated = await transaction.mediaAsset.updateMany({
          where: { workspaceId: input.workspaceId, messageId: input.messageId, transcriptionState: 'failed' },
          data: { transcriptionState: 'pending', failureCode: null, transcriptionAttemptId: null, processingStartedAt: null },
        });
        if (updated.count === 0) return 'not_failed';
        eventType = 'message.audio.ingested';
      }

      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId, aggregateType: 'message', aggregateId: input.messageId,
          eventType, payload: {
            workspaceId: input.workspaceId, messageId: input.messageId, negotiationId: message.negotiationId,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId, userId: input.userId, negotiationId: message.negotiationId,
          action: 'processing_retry_requested', changedFields: [`${input.kind}Processing`],
          details: { kind: input.kind },
        },
      });
      return 'queued';
    }, { isolationLevel: 'Serializable' });
  }
}
