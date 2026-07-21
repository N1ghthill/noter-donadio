export interface PendingOutboxEvent {
  readonly id: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempts: number;
}

export interface OutboxRepository {
  claimBatch(limit: number): Promise<readonly PendingOutboxEvent[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, errorCode: string, retryAt: Date): Promise<void>;
}

export interface EventPublisher {
  publish(event: PendingOutboxEvent): Promise<void>;
}

export interface DispatchSummary {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

export class OutboxDispatcher {
  public constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: EventPublisher,
  ) {}

  public async dispatchBatch(limit = 25): Promise<DispatchSummary> {
    const events = await this.repository.claimBatch(limit);
    let published = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.publisher.publish(event);
        await this.repository.markPublished(event.id);
        published += 1;
      } catch (error: unknown) {
        await this.repository.markFailed(
          event.id,
          safeErrorCode(error),
          retryDate(event.attempts),
        );
        failed += 1;
      }
    }

    return { claimed: events.length, published, failed };
  }
}

function retryDate(attempts: number): Date {
  const delaySeconds = Math.min(300, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delaySeconds * 1_000);
}

function safeErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code).slice(0, 100);
  }

  return error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN_ERROR';
}
