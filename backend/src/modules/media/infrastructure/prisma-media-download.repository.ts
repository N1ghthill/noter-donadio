import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  MediaDownloadClaim,
  MediaDownloadRepository,
} from '../domain/media-download.js';

export class PrismaMediaDownloadRepository implements MediaDownloadRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
  }): Promise<MediaDownloadClaim> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.mediaAsset.updateMany({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          externalMediaId: { not: null },
          removedAt: null,
          OR: [
            { downloadState: { in: ['pending', 'failed'] } },
            {
              downloadState: 'processing',
              downloadStartedAt: { lt: input.staleBefore },
            },
          ],
        },
        data: {
          downloadState: 'processing',
          downloadAttemptId: input.attemptId,
          downloadStartedAt: input.now,
          downloadFailureCode: null,
        },
      });
      if (claimed.count === 0) {
        const current = await transaction.mediaAsset.findFirst({
          where: { workspaceId: input.workspaceId, messageId: input.messageId },
          select: { downloadState: true },
        });
        if (!current) return { status: 'missing' };
        return { status: current.downloadState === 'completed' ? 'completed' : 'busy' };
      }

      const asset = await transaction.mediaAsset.findFirstOrThrow({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          downloadAttemptId: input.attemptId,
        },
        select: {
          externalMediaId: true,
          mimeType: true,
          message: {
            select: {
              messageType: true,
              whatsappAccount: {
                select: {
                  provider: true,
                  providerPhoneNumberId: true,
                },
              },
            },
          },
        },
      });
      if (!asset.externalMediaId) throw new Error('Mídia reivindicada sem referência externa');
      if (!['audio', 'image', 'document'].includes(asset.message.messageType)) {
        throw new Error('Tipo de mídia reivindicada não suportado');
      }
      return {
        status: 'claimed',
        target: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          attemptId: input.attemptId,
          externalMediaId: asset.externalMediaId,
          expectedMimeType: asset.mimeType,
          messageType: asset.message.messageType as 'audio' | 'image' | 'document',
          provider: asset.message.whatsappAccount.provider,
          providerPhoneNumberId: asset.message.whatsappAccount.providerPhoneNumberId,
        },
      };
    });
  }

  public async complete(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    externalMediaId: string;
    storageKey: string;
    fileSizeBytes: number;
    mimeType: string;
    durationSeconds: number | null;
    retentionUntil: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          externalMediaId: input.externalMediaId,
          downloadState: 'processing',
          downloadAttemptId: input.attemptId,
        },
        data: {
          downloadState: 'completed',
          downloadAttemptId: null,
          downloadStartedAt: null,
          downloadFailureCode: null,
          storageKey: input.storageKey,
          fileSizeBytes: BigInt(input.fileSizeBytes),
          mimeType: input.mimeType,
          durationSeconds: input.durationSeconds,
          retentionUntil: input.retentionUntil,
        },
      });
      if (updated.count === 0) return false;

      const message = await transaction.message.findFirstOrThrow({
        where: { workspaceId: input.workspaceId, id: input.messageId },
        select: { negotiationId: true, contactId: true, messageType: true },
      });
      if (!message.negotiationId) throw new Error('Mensagem de mídia sem negociação');
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'message',
          aggregateId: input.messageId,
          eventType: message.messageType === 'audio'
            ? 'message.audio.ingested'
            : 'message.media.available',
          payload: message.messageType === 'audio'
            ? {
                workspaceId: input.workspaceId,
                messageId: input.messageId,
                negotiationId: message.negotiationId,
              }
            : {
                workspaceId: input.workspaceId,
                messageId: input.messageId,
                contactId: message.contactId,
                negotiationId: message.negotiationId,
              },
        },
      });
      return true;
    });
  }

  public async fail(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    externalMediaId: string;
    failureCode: string;
  }): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: {
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        externalMediaId: input.externalMediaId,
        downloadState: 'processing',
        downloadAttemptId: input.attemptId,
      },
      data: {
        downloadState: 'failed',
        downloadAttemptId: null,
        downloadStartedAt: null,
        downloadFailureCode: input.failureCode,
      },
    });
  }
}
