import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

import type { EventPublisher, PendingOutboxEvent } from '../domain/outbox-dispatcher.js';

export class BullMqEventPublisher implements EventPublisher {
  private readonly connection: Redis;
  private readonly textQueue: Queue;
  private readonly audioQueue: Queue;
  private readonly realtimeQueue: Queue;

  public constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.connection.on('error', () => undefined);
    this.textQueue = new Queue('ai-processing', { connection: this.connection });
    this.audioQueue = new Queue('audio-transcription', { connection: this.connection });
    this.realtimeQueue = new Queue('realtime-events', { connection: this.connection });
  }

  public async publish(event: PendingOutboxEvent): Promise<void> {
    const queue = this.queueFor(event.eventType);
    await queue.add(event.eventType, event.payload, eventJobOptions(event.eventType, event.id));
  }

  public async close(): Promise<void> {
    await Promise.all([
      this.textQueue.close(),
      this.audioQueue.close(),
      this.realtimeQueue.close(),
    ]);
    await this.connection.quit();
  }

  private queueFor(eventType: string): Queue {
    if (eventType === 'message.audio.ingested') return this.audioQueue;
    if (eventType === 'message.text.ingested') return this.textQueue;
    return this.realtimeQueue;
  }
}

export function eventJobOptions(eventType: string, eventId: string): JobsOptions {
  const audio = eventType === 'message.audio.ingested';
  return {
    jobId: eventId,
    attempts: audio ? 12 : 3,
    backoff: audio
      ? { type: 'fixed', delay: 30_000 }
      : { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: { age: 604_800, count: 10_000 },
  };
}
