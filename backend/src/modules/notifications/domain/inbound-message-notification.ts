import { randomUUID } from 'node:crypto';

const LEASE_DURATION_MS = 5 * 60 * 1_000;

export interface NotificationTarget {
  readonly deliveryId: string;
  readonly workspaceId: string;
  readonly messageId: string;
  readonly attemptId: string;
  readonly milestone: NotificationMilestone;
  readonly variant: NotificationVariant;
}

export const NOTIFICATION_MILESTONES = [
  'message_received',
  'analysis_completed',
  'analysis_attention',
  'transcription_attention',
] as const;
export type NotificationMilestone = (typeof NOTIFICATION_MILESTONES)[number];

export type NotificationVariant =
  | 'message_received'
  | 'new_lead_identified'
  | 'analysis_ready'
  | 'analysis_attention'
  | 'transcription_attention';

export type NotificationClaim =
  | { readonly status: 'claimed'; readonly target: NotificationTarget }
  | { readonly status: 'completed' | 'busy' | 'missing' | 'ineligible' };

export interface InboundMessageNotificationRepository {
  claim(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
    notBefore: Date;
    milestone: NotificationMilestone;
  }): Promise<NotificationClaim>;
  complete(target: NotificationTarget, completedAt: Date): Promise<boolean>;
  fail(target: NotificationTarget, failureCode: string): Promise<void>;
}

export interface InboundMessageNotifier {
  notify(variant: NotificationVariant): Promise<void>;
}

export class InboundMessageNotificationService {
  public constructor(
    private readonly repository: InboundMessageNotificationRepository,
    private readonly notifier: InboundMessageNotifier,
    private readonly notBefore: Date,
  ) {}

  public async execute(
    workspaceId: string,
    messageId: string,
    milestone: NotificationMilestone,
    now = new Date(),
  ) {
    const claim = await this.repository.claim({
      workspaceId,
      messageId,
      attemptId: randomUUID(),
      now,
      staleBefore: new Date(now.getTime() - LEASE_DURATION_MS),
      notBefore: this.notBefore,
      milestone,
    });
    if (claim.status !== 'claimed') {
      return { status: claim.status === 'ineligible' ? 'skipped' : claim.status } as const;
    }

    try {
      await this.notifier.notify(claim.target.variant);
      const completed = await this.repository.complete(claim.target, new Date());
      return { status: completed ? 'completed' : 'busy' } as const;
    } catch (error: unknown) {
      const failureCode = notificationFailureCode(error);
      await this.repository.fail(claim.target, failureCode);
      throw new NotificationDeliveryFailedError(failureCode);
    }
  }
}

export class NotificationDeliveryFailedError extends Error {
  public constructor(public readonly code: string) {
    super('Falha no envio da notificação');
    this.name = 'NotificationDeliveryFailedError';
  }
}

function notificationFailureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code).slice(0, 100);
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN_ERROR';
}
