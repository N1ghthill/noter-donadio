import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  MessageAnalysisClaim,
  MessageAnalysisRepository,
  MessageAnalysisResult,
  MessageAnalysisTarget,
} from '../domain/message-analysis.js';

export class PrismaMessageAnalysisRepository implements MessageAnalysisRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: {
    workspaceId: string;
    messageId: string;
    analysisType: string;
    promptVersion: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
    notBefore: Date | null;
  }): Promise<MessageAnalysisClaim> {
    return this.prisma.$transaction(async (transaction) => {
      const message = await transaction.message.findFirst({
        where: { id: input.messageId, workspaceId: input.workspaceId },
        select: {
          id: true,
          negotiationId: true,
          direction: true,
          messageType: true,
          content: true,
          createdAt: true,
          mediaAsset: {
            select: { transcriptionState: true, transcriptionText: true },
          },
        },
      });
      if (!message?.negotiationId) return { status: 'missing' };
      if (input.notBefore !== null && message.createdAt < input.notBefore) {
        return { status: 'ineligible' };
      }
      const text = message.messageType === 'audio'
        ? message.mediaAsset?.transcriptionText
        : message.content;
      if (!text || (message.messageType === 'audio' && message.mediaAsset?.transcriptionState !== 'completed')) {
        return { status: 'busy' };
      }

      const analysis = await transaction.aiAnalysis.upsert({
        where: {
          messageId_analysisType_promptVersion: {
            messageId: input.messageId,
            analysisType: input.analysisType,
            promptVersion: input.promptVersion,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          negotiationId: message.negotiationId,
          analysisType: input.analysisType,
          promptVersion: input.promptVersion,
          state: 'pending',
        },
        update: {},
        select: { id: true, state: true },
      });
      const claimed = await transaction.aiAnalysis.updateMany({
        where: {
          id: analysis.id,
          workspaceId: input.workspaceId,
          OR: [
            { state: { in: ['pending', 'failed'] } },
            { state: 'processing', processingStartedAt: { lt: input.staleBefore } },
          ],
        },
        data: {
          state: 'processing',
          analysisAttemptId: input.attemptId,
          processingStartedAt: input.now,
          failureCode: null,
        },
      });
      if (claimed.count === 0) {
        return { status: analysis.state === 'completed' ? 'completed' : 'busy' };
      }
      return {
        status: 'claimed',
        target: {
          analysisId: analysis.id,
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          negotiationId: message.negotiationId,
          attemptId: input.attemptId,
          direction: message.direction,
          text,
          promptVersion: input.promptVersion,
        },
      };
    });
  }

  public async complete(input: MessageAnalysisTarget & MessageAnalysisResult & {
    processingTimeMs: number;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.aiAnalysis.updateMany({
        where: {
          id: input.analysisId,
          workspaceId: input.workspaceId,
          state: 'processing',
          analysisAttemptId: input.attemptId,
        },
        data: {
          state: 'completed',
          analysisAttemptId: null,
          processingStartedAt: null,
          summary: input.summary,
          entities: input.entities as Prisma.InputJsonObject,
          sentiment: input.sentiment,
          sentimentConfidence: input.sentimentConfidence,
          objections: [...input.objections],
          nextActions: [...input.nextActions],
          suggestedTags: [...input.suggestedTags],
          suggestedStage: input.suggestedStage,
          confidenceScore: input.confidence,
          modelUsed: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          processingTimeMs: input.processingTimeMs,
          failureCode: null,
        },
      });
      if (updated.count === 0) return false;
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'ai_analysis',
          aggregateId: input.analysisId,
          eventType: 'analysis.changed',
          payload: {
            workspaceId: input.workspaceId,
            analysisId: input.analysisId,
            messageId: input.messageId,
            negotiationId: input.negotiationId,
            state: 'completed',
          },
        },
      });
      return true;
    });
  }

  public async fail(input: MessageAnalysisTarget & { failureCode: string }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.aiAnalysis.updateMany({
        where: {
          id: input.analysisId,
          workspaceId: input.workspaceId,
          state: 'processing',
          analysisAttemptId: input.attemptId,
        },
        data: {
          state: 'failed',
          analysisAttemptId: null,
          processingStartedAt: null,
          failureCode: input.failureCode,
        },
      });
      if (updated.count === 0) return;
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'ai_analysis',
          aggregateId: input.analysisId,
          eventType: 'analysis.changed',
          payload: {
            workspaceId: input.workspaceId,
            analysisId: input.analysisId,
            messageId: input.messageId,
            negotiationId: input.negotiationId,
            state: 'failed',
          },
        },
      });
    });
  }
}
