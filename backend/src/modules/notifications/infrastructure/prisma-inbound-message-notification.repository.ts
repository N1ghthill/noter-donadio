import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  InboundMessageNotificationRepository,
  NotificationClaim,
  NotificationMilestone,
  NotificationTarget,
  NotificationVariant,
} from '../domain/inbound-message-notification.js';

export class PrismaInboundMessageNotificationRepository
implements InboundMessageNotificationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
    notBefore: Date;
    milestone: NotificationMilestone;
  }): Promise<NotificationClaim> {
    return this.prisma.$transaction(async (transaction) => {
      const message = await transaction.message.findUnique({
        where: {
          workspaceId_id: { workspaceId: input.workspaceId, id: input.messageId },
        },
        select: { id: true, direction: true, occurredAt: true },
      });
      if (!message) return { status: 'missing' };
      if (message.direction !== 'inbound' || message.occurredAt < input.notBefore) {
        return { status: 'ineligible' };
      }
      const variant = await notificationVariant(
        transaction,
        input.workspaceId,
        input.messageId,
        input.milestone,
      );
      if (variant === 'ineligible') return { status: 'ineligible' };
      if (variant === 'busy') return { status: 'busy' };

      await transaction.notificationDelivery.createMany({
        data: [{
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          channel: 'bark',
          kind: input.milestone,
        }],
        skipDuplicates: true,
      });
      const claimed = await transaction.notificationDelivery.updateMany({
        where: {
          messageId: input.messageId,
          channel: 'bark',
          kind: input.milestone,
          OR: [
            { state: 'pending' },
            { state: 'failed' },
            { state: 'processing', startedAt: { lt: input.staleBefore } },
          ],
        },
        data: {
          state: 'processing',
          attemptId: input.attemptId,
          startedAt: input.now,
          completedAt: null,
          failureCode: null,
        },
      });
      if (claimed.count === 0) {
        const current = await transaction.notificationDelivery.findUnique({
          where: {
            messageId_channel_kind: {
              messageId: input.messageId,
              channel: 'bark',
              kind: input.milestone,
            },
          },
          select: { state: true },
        });
        return { status: current?.state === 'completed' ? 'completed' : 'busy' };
      }

      const delivery = await transaction.notificationDelivery.findUniqueOrThrow({
        where: {
          messageId_channel_kind: {
            messageId: input.messageId,
            channel: 'bark',
            kind: input.milestone,
          },
        },
        select: { id: true },
      });
      return {
        status: 'claimed',
        target: {
          deliveryId: delivery.id,
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          attemptId: input.attemptId,
          milestone: input.milestone,
          variant,
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  public async complete(target: NotificationTarget, completedAt: Date): Promise<boolean> {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: target.deliveryId,
        workspaceId: target.workspaceId,
        messageId: target.messageId,
        state: 'processing',
        attemptId: target.attemptId,
      },
      data: {
        state: 'completed',
        completedAt,
        failureCode: null,
      },
    });
    return result.count === 1;
  }

  public async fail(target: NotificationTarget, failureCode: string): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: target.deliveryId,
        workspaceId: target.workspaceId,
        messageId: target.messageId,
        state: 'processing',
        attemptId: target.attemptId,
      },
      data: { state: 'failed', failureCode: failureCode.slice(0, 100) },
    });
  }
}

async function notificationVariant(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  messageId: string,
  milestone: NotificationMilestone,
): Promise<NotificationVariant | 'busy' | 'ineligible'> {
  if (milestone === 'message_received') return 'message_received';
  if (milestone === 'transcription_attention') {
    const media = await transaction.mediaAsset.findFirst({
      where: { workspaceId, messageId },
      select: { transcriptionState: true },
    });
    if (!media || media.transcriptionState === 'completed') return 'ineligible';
    return media.transcriptionState === 'failed' ? 'transcription_attention' : 'busy';
  }

  const analysis = await transaction.aiAnalysis.findFirst({
    where: { workspaceId, messageId },
    orderBy: { createdAt: 'desc' },
    select: { state: true, conversationContext: true },
  });
  if (!analysis) return milestone === 'analysis_attention' ? 'busy' : 'ineligible';
  if (milestone === 'analysis_attention') {
    if (analysis.state === 'completed') return 'ineligible';
    return analysis.state === 'failed' ? 'analysis_attention' : 'busy';
  }
  if (analysis.state !== 'completed') return analysis.state === 'failed' ? 'ineligible' : 'busy';
  return interactionType(analysis.conversationContext) === 'new_lead'
    ? 'new_lead_identified'
    : 'analysis_ready';
}

function interactionType(value: Prisma.JsonValue | null): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value.interactionType
    : undefined;
}
