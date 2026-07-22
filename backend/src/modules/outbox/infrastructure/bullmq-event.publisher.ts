import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

import type { EventPublisher, PendingOutboxEvent } from '../domain/outbox-dispatcher.js';
import { safeErrorContext } from '../../../config/logger.js';

interface ErrorLogger {
  error(context: Readonly<Record<string, unknown>>, message: string): void;
}

export class BullMqEventPublisher implements EventPublisher {
  private readonly connection: Redis;
  private readonly textQueue: Queue;
  private readonly audioQueue: Queue;
  private readonly realtimeQueue: Queue;

  public constructor(redisUrl: string, logger?: ErrorLogger, prefix?: string) {
    this.connection = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.connection.on('error', (error) => {
      logger?.error(safeErrorContext(error), 'Falha na conexão Redis da outbox');
    });
    const queueOptions = { connection: this.connection, ...(prefix ? { prefix } : {}) };
    this.textQueue = new Queue('ai-processing', queueOptions);
    this.audioQueue = new Queue('audio-transcription', queueOptions);
    this.realtimeQueue = new Queue('realtime-events', queueOptions);
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
    if (eventType === 'message.text.ingested' || eventType === 'message.audio.ready_for_analysis') {
      return this.textQueue;
    }
    return this.realtimeQueue;
  }
}

export function eventJobOptions(eventType: string, eventId: string): JobsOptions {
  const longRunning = eventType === 'message.audio.ingested'
    || eventType === 'message.text.ingested'
    || eventType === 'message.audio.ready_for_analysis';
  return {
    jobId: eventId,
    attempts: longRunning ? 12 : 3,
    backoff: longRunning
      ? { type: 'fixed', delay: 30_000 }
      : { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: { age: 604_800, count: 10_000 },
  };
}
