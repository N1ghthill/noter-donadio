import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  OUTBOX_STATUSES,
  PROCESSING_STATES,
  QUEUE_NAMES,
  QUEUE_STATES,
  type OperationalMetricsCollector,
  type OperationalMetricsSnapshot,
} from '../domain/operational-metrics.js';

export class PrismaBullMqOperationalMetricsCollector implements OperationalMetricsCollector {
  private readonly connection: Redis;
  private readonly queues: Readonly<Record<typeof QUEUE_NAMES[number], Queue>>;

  public constructor(
    private readonly prisma: PrismaClient,
    redisUrl: string,
    prefix?: string,
  ) {
    this.connection = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
    });
    this.connection.on('error', () => undefined);
    const options = { connection: this.connection, ...(prefix ? { prefix } : {}) };
    this.queues = {
      'ai-processing': new Queue('ai-processing', options),
      'audio-transcription': new Queue('audio-transcription', options),
      'realtime-events': new Queue('realtime-events', options),
    };
  }

  public async collect(): Promise<OperationalMetricsSnapshot> {
    const now = new Date();
    const [outboxGroups, transcriptionGroups, analysisGroups, mediaDeletionTasks,
      oldestOutbox, oldestTranscription, oldestAnalysis, ...queueCounts] = await Promise.all([
      this.prisma.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.mediaAsset.groupBy({ by: ['transcriptionState'], _count: { _all: true } }),
      this.prisma.aiAnalysis.groupBy({ by: ['state'], _count: { _all: true } }),
      this.prisma.mediaDeletionTask.count(),
      this.prisma.outboxEvent.findFirst({
        where: { status: { in: ['pending', 'processing'] } },
        orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      }),
      this.prisma.mediaAsset.findFirst({
        where: { transcriptionState: { in: ['pending', 'processing'] } },
        orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      }),
      this.prisma.aiAnalysis.findFirst({
        where: { state: { in: ['pending', 'processing'] } },
        orderBy: { createdAt: 'asc' }, select: { createdAt: true },
      }),
      ...QUEUE_NAMES.map((name) => this.queues[name].getJobCounts(...QUEUE_STATES)),
    ]);

    return {
      outbox: countGroups(OUTBOX_STATUSES, outboxGroups.map((group) => [group.status, group._count._all])),
      transcriptions: countGroups(PROCESSING_STATES, transcriptionGroups.map((group) => [group.transcriptionState, group._count._all])),
      analyses: countGroups(PROCESSING_STATES, analysisGroups.map((group) => [group.state, group._count._all])),
      mediaDeletionTasks,
      oldestPendingOutboxAgeSeconds: ageSeconds(oldestOutbox?.createdAt, now),
      oldestPendingTranscriptionAgeSeconds: ageSeconds(oldestTranscription?.createdAt, now),
      oldestPendingAnalysisAgeSeconds: ageSeconds(oldestAnalysis?.createdAt, now),
      queues: Object.fromEntries(QUEUE_NAMES.map((name, index) => [
        name,
        countGroups(QUEUE_STATES, Object.entries(queueCounts[index] ?? {})),
      ])) as OperationalMetricsSnapshot['queues'],
    };
  }

  public async close(): Promise<void> {
    await Promise.all(QUEUE_NAMES.map((name) => this.queues[name].close()));
    await this.connection.quit();
  }
}

function countGroups<const Key extends readonly string[]>(
  keys: Key,
  values: readonly (readonly [string, number])[],
): Record<Key[number], number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key[number], number>;
  for (const [key, count] of values) {
    if (Object.hasOwn(counts, key)) counts[key as Key[number]] = count;
  }
  return counts;
}

function ageSeconds(createdAt: Date | undefined, now: Date): number {
  return createdAt ? Math.max(0, (now.getTime() - createdAt.getTime()) / 1_000) : 0;
}
