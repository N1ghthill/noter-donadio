import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  MessageAnalysisContext,
  MessageAnalysisClaim,
  MessageAnalysisRepository,
  MessageAnalysisResult,
  MessageAnalysisTarget,
} from '../domain/message-analysis.js';

const MAX_CONTEXT_NEGOTIATIONS = 5;
const MAX_CONTEXT_MESSAGES = 10;
const MAX_CONTEXT_TEXT_LENGTH = 1_000;
const CLOSED_STAGES = ['closed_won', 'closed_lost'] as const;

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
          contactId: true,
          negotiationId: true,
          direction: true,
          messageType: true,
          content: true,
          createdAt: true,
          occurredAt: true,
          contact: { select: { source: true } },
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

      const [activeNegotiationCount, candidateRows, priorMessageCount, recentRows] = await Promise.all([
        transaction.negotiation.count({
          where: {
            workspaceId: input.workspaceId,
            contactId: message.contactId,
            stage: { notIn: [...CLOSED_STAGES] },
          },
        }),
        transaction.negotiation.findMany({
          where: {
            workspaceId: input.workspaceId,
            contactId: message.contactId,
            stage: { notIn: [...CLOSED_STAGES] },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: MAX_CONTEXT_NEGOTIATIONS,
          select: {
            id: true,
            title: true,
            stage: true,
            productInterest: true,
            lastSummary: true,
            nextAction: true,
          },
        }),
        transaction.message.count({
          where: {
            workspaceId: input.workspaceId,
            contactId: message.contactId,
            id: { not: message.id },
            createdAt: { lte: message.createdAt },
          },
        }),
        transaction.message.findMany({
          where: {
            workspaceId: input.workspaceId,
            contactId: message.contactId,
            id: { not: message.id },
            occurredAt: { lte: message.occurredAt },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: MAX_CONTEXT_MESSAGES,
          select: {
            negotiationId: true,
            direction: true,
            messageType: true,
            content: true,
            mediaAsset: { select: { transcriptionState: true, transcriptionText: true } },
          },
        }),
      ]);
      const candidates = candidateRows.map((candidate, index) => ({
        reference: `case_${index + 1}`,
        negotiationId: candidate.id,
        title: limited(candidate.title),
        stage: candidate.stage,
        productInterest: limited(candidate.productInterest),
        lastSummary: limited(candidate.lastSummary),
        nextAction: limited(candidate.nextAction),
      }));
      const referenceByNegotiationId = new Map(
        candidates.map((candidate) => [candidate.negotiationId, candidate.reference] as const),
      );
      const context: MessageAnalysisContext = {
        sender: message.direction === 'inbound' ? 'contact' : 'workspace_user',
        contactRecognition: message.contact.source === 'whatsapp_auto' && priorMessageCount === 0
          ? 'new'
          : 'existing',
        activeNegotiationCount,
        candidatesTruncated: activeNegotiationCount > candidates.length,
        provisionalCaseReference: referenceByNegotiationId.get(message.negotiationId) ?? null,
        candidates,
        recentMessages: recentRows.toReversed().flatMap((recent) => {
          const recentText = recent.messageType === 'audio'
            && recent.mediaAsset?.transcriptionState === 'completed'
            ? recent.mediaAsset.transcriptionText
            : recent.content;
          return recentText?.trim() ? [{
            direction: recent.direction,
            text: recentText.trim().slice(0, MAX_CONTEXT_TEXT_LENGTH),
            caseReference: recent.negotiationId
              ? referenceByNegotiationId.get(recent.negotiationId) ?? null
              : null,
          }] : [];
        }),
      };

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
          context,
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
          conversationContext: input.conversationContext as unknown as Prisma.InputJsonObject,
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

function limited(value: string | null): string | null {
  return value === null ? null : value.slice(0, MAX_CONTEXT_TEXT_LENGTH);
}
