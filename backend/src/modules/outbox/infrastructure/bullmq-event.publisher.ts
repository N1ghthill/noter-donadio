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
  private readonly mediaDownloadQueue: Queue;
  private readonly realtimeQueue: Queue;
  private readonly notificationQueue?: Queue;

  public constructor(
    redisUrl: string,
    logger?: ErrorLogger,
    prefix?: string,
    notificationsEnabled = false,
  ) {
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
    this.mediaDownloadQueue = new Queue('media-download', queueOptions);
    this.realtimeQueue = new Queue('realtime-events', queueOptions);
    if (notificationsEnabled) {
      this.notificationQueue = new Queue('inbound-notifications', queueOptions);
    }
  }

  public async publish(event: PendingOutboxEvent): Promise<void> {
    const queue = this.queueFor(event.eventType);
    await queue.add(event.eventType, event.payload, eventJobOptions(event.eventType, event.id));
    const milestone = notificationMilestoneFor(event.eventType, event.payload);
    if (milestone && this.notificationQueue) {
      await this.notificationQueue.add(
        'notification.milestone',
        notificationJobPayload(event.payload, milestone),
        notificationJobOptions(event.id, milestone),
      );
    }
  }

  public async close(): Promise<void> {
    await Promise.all([
      this.textQueue.close(),
      this.audioQueue.close(),
      this.mediaDownloadQueue.close(),
      this.realtimeQueue.close(),
      this.notificationQueue?.close(),
    ]);
    await this.connection.quit();
  }

  private queueFor(eventType: string): Queue {
    if (eventType === 'message.audio.download_requested'
      || eventType === 'message.media.download_requested') return this.mediaDownloadQueue;
    if (eventType === 'message.audio.ingested') return this.audioQueue;
    if (eventType === 'message.text.ingested' || eventType === 'message.audio.ready_for_analysis') {
      return this.textQueue;
    }
    return this.realtimeQueue;
  }
}

type NotificationMilestone =
  | 'message_received'
  | 'analysis_completed'
  | 'analysis_attention'
  | 'transcription_attention';

export function notificationJobOptions(
  eventId: string,
  milestone: NotificationMilestone,
): JobsOptions {
  const requiresFinalState = milestone === 'analysis_attention'
    || milestone === 'transcription_attention';
  return {
    jobId: eventId,
    attempts: 12,
    backoff: { type: 'fixed', delay: 30_000 },
    ...(requiresFinalState ? { delay: 10 * 60 * 1_000 } : {}),
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: { age: 604_800, count: 10_000 },
  };
}

export function notificationJobPayload(
  payload: unknown,
  milestone: NotificationMilestone,
): Readonly<Record<string, unknown>> {
  if (typeof payload !== 'object' || payload === null) return {};
  const candidate = payload as Readonly<Record<string, unknown>>;
  return {
    workspaceId: candidate.workspaceId,
    messageId: candidate.messageId,
    milestone,
  };
}

export function notificationMilestoneFor(
  eventType: string,
  payload: unknown,
): NotificationMilestone | null {
  const candidate = typeof payload === 'object' && payload !== null
    ? payload as Readonly<Record<string, unknown>>
    : {};
  if (eventType === 'message.persisted') return 'message_received';
  if (eventType === 'analysis.changed') {
    if (candidate.state === 'completed') return 'analysis_completed';
    if (candidate.state === 'failed') return 'analysis_attention';
  }
  if (eventType === 'message.transcription.changed' && candidate.state === 'failed') {
    return 'transcription_attention';
  }
  return null;
}

export function eventJobOptions(eventType: string, eventId: string): JobsOptions {
  const longRunning = eventType === 'message.audio.download_requested'
    || eventType === 'message.media.download_requested'
    || eventType === 'message.audio.ingested'
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
