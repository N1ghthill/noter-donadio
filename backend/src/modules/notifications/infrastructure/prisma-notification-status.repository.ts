import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  NotificationStatus,
  NotificationStatusRepository,
} from '../domain/notification-status.js';

export class PrismaNotificationStatusRepository implements NotificationStatusRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async get(workspaceId: string): Promise<NotificationStatus> {
    const [messageSummary, deliverySummary, deliveryStates] = await Promise.all([
      this.prisma.message.aggregate({
        where: { workspaceId, direction: 'inbound' },
        _max: { occurredAt: true },
      }),
      this.prisma.notificationDelivery.aggregate({
        where: { workspaceId, state: 'completed' },
        _max: { completedAt: true },
      }),
      this.prisma.notificationDelivery.groupBy({
        by: ['state'],
        where: { workspaceId },
        _count: { _all: true },
      }),
    ]);
    const deliveries = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const item of deliveryStates) deliveries[item.state] = item._count._all;
    return {
      lastInboundMessageAt: messageSummary._max.occurredAt,
      lastDeliveredAt: deliverySummary._max.completedAt,
      deliveries,
    };
  }
}
