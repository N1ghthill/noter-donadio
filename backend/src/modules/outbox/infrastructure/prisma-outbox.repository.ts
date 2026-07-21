import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  OutboxRepository,
  PendingOutboxEvent,
} from '../domain/outbox-dispatcher.js';

interface ClaimedRow {
  readonly id: string;
  readonly event_type: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export class PrismaOutboxRepository implements OutboxRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claimBatch(limit: number): Promise<readonly PendingOutboxEvent[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE (
            (status IN ('pending', 'failed') AND attempts < 10)
            OR status = 'processing'
          )
          AND available_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE outbox_events AS event
      SET status = 'processing',
          attempts = event.attempts + CASE WHEN event.status = 'processing' THEN 0 ELSE 1 END,
          available_at = NOW() + INTERVAL '5 minutes',
          updated_at = NOW()
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.event_type, event.payload, event.attempts
    `;

    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      payload: row.payload as Readonly<Record<string, unknown>>,
      attempts: row.attempts,
    }));
  }

  public async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        lastErrorCode: null,
      },
    });
  }

  public async markFailed(id: string, errorCode: string, retryAt: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'failed',
        availableAt: retryAt,
        lastErrorCode: errorCode,
      },
    });
  }
}
