import { z } from 'zod';

import { NOTIFICATION_MILESTONES, type NotificationMilestone } from '../domain/inbound-message-notification.js';

const notificationJobSchema = z.object({
  workspaceId: z.uuid(),
  messageId: z.uuid(),
  milestone: z.enum(NOTIFICATION_MILESTONES),
}).strict();

export interface InboundMessageNotificationJob {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly milestone: NotificationMilestone;
}

export function parseInboundMessageNotificationJob(
  name: string,
  data: unknown,
): InboundMessageNotificationJob {
  if (name !== 'notification.milestone') throw new Error('unsupported_notification_job');
  const parsed = notificationJobSchema.parse(data);
  return {
    workspaceId: parsed.workspaceId,
    messageId: parsed.messageId,
    milestone: parsed.milestone,
  };
}
