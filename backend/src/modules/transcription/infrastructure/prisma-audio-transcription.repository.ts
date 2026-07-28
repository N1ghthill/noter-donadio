import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  AudioTranscriptionRepository,
  TranscriptionClaim,
} from '../domain/audio-transcription.js';

export class PrismaAudioTranscriptionRepository implements AudioTranscriptionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
  }): Promise<TranscriptionClaim> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.mediaAsset.updateMany({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          downloadState: 'completed',
          storageKey: { not: null },
          OR: [
            { transcriptionState: { in: ['pending', 'failed'] } },
            {
              transcriptionState: 'processing',
              processingStartedAt: { lt: input.staleBefore },
            },
          ],
        },
        data: {
          transcriptionState: 'processing',
          transcriptionAttemptId: input.attemptId,
          processingStartedAt: input.now,
          failureCode: null,
        },
      });

      if (claimed.count === 0) {
        const current = await transaction.mediaAsset.findFirst({
          where: { workspaceId: input.workspaceId, messageId: input.messageId },
          select: { transcriptionState: true },
        });
        if (!current) return { status: 'missing' };
        return { status: current.transcriptionState === 'completed' ? 'completed' : 'busy' };
      }

      const asset = await transaction.mediaAsset.findFirstOrThrow({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          transcriptionAttemptId: input.attemptId,
        },
        select: { durationSeconds: true, mimeType: true },
      });
      return {
        status: 'claimed',
        target: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          attemptId: input.attemptId,
          durationSeconds: asset.durationSeconds,
          mimeType: asset.mimeType,
        },
      };
    });
  }

  public async complete(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    text: string;
    language: string;
    model: string;
    confidence: number | null;
    completedAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          transcriptionState: 'processing',
          transcriptionAttemptId: input.attemptId,
        },
        data: {
          transcriptionState: 'completed',
          transcriptionAttemptId: null,
          processingStartedAt: null,
          transcriptionText: input.text,
          transcriptionLanguage: input.language,
          transcriptionModel: input.model,
          transcriptionConfidence: input.confidence,
          failureCode: null,
          transcribedAt: input.completedAt,
        },
      });
      if (updated.count === 0) return false;

      const message = await transaction.message.findFirstOrThrow({
        where: { id: input.messageId, workspaceId: input.workspaceId },
        select: { negotiationId: true },
      });
      if (!message.negotiationId) throw new Error('Mensagem de áudio sem negociação');
      await transaction.outboxEvent.createMany({
        data: [
          {
            workspaceId: input.workspaceId,
            aggregateType: 'message',
            aggregateId: input.messageId,
            eventType: 'message.transcription.changed',
            payload: {
              workspaceId: input.workspaceId,
              messageId: input.messageId,
              negotiationId: message.negotiationId,
              state: 'completed',
            },
          },
          {
            workspaceId: input.workspaceId,
            aggregateType: 'message',
            aggregateId: input.messageId,
            eventType: 'message.audio.ready_for_analysis',
            payload: {
              workspaceId: input.workspaceId,
              messageId: input.messageId,
              negotiationId: message.negotiationId,
            },
          },
        ],
      });
      return true;
    });
  }

  public async fail(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    failureCode: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          transcriptionState: 'processing',
          transcriptionAttemptId: input.attemptId,
        },
        data: {
          transcriptionState: 'failed',
          transcriptionAttemptId: null,
          processingStartedAt: null,
          failureCode: input.failureCode,
        },
      });
      if (updated.count === 0) return;

      const message = await transaction.message.findFirstOrThrow({
        where: { id: input.messageId, workspaceId: input.workspaceId },
        select: { negotiationId: true },
      });
      if (!message.negotiationId) throw new Error('Mensagem de áudio sem negociação');
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'message',
          aggregateId: input.messageId,
          eventType: 'message.transcription.changed',
          payload: {
            workspaceId: input.workspaceId,
            messageId: input.messageId,
            negotiationId: message.negotiationId,
            state: 'failed',
          },
        },
      });
    });
  }
}
