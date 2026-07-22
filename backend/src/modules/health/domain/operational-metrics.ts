export const OUTBOX_STATUSES = ['pending', 'processing', 'published', 'failed'] as const;
export const PROCESSING_STATES = ['pending', 'processing', 'completed', 'failed'] as const;
export const QUEUE_NAMES = ['ai-processing', 'audio-transcription', 'realtime-events'] as const;
export const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed', 'paused'] as const;

type OutboxStatus = typeof OUTBOX_STATUSES[number];
type ProcessingState = typeof PROCESSING_STATES[number];
type QueueName = typeof QUEUE_NAMES[number];
type QueueState = typeof QUEUE_STATES[number];

export interface OperationalMetricsSnapshot {
  readonly outbox: Readonly<Record<OutboxStatus, number>>;
  readonly transcriptions: Readonly<Record<ProcessingState, number>>;
  readonly analyses: Readonly<Record<ProcessingState, number>>;
  readonly mediaDeletionTasks: number;
  readonly oldestPendingOutboxAgeSeconds: number;
  readonly oldestPendingTranscriptionAgeSeconds: number;
  readonly oldestPendingAnalysisAgeSeconds: number;
  readonly queues: Readonly<Record<QueueName, Readonly<Record<QueueState, number>>>>;
}

export interface OperationalMetricsCollector {
  collect(): Promise<OperationalMetricsSnapshot>;
}

export function renderPrometheusMetrics(snapshot: OperationalMetricsSnapshot): string {
  const lines = [
    '# HELP noter_outbox_events Number of persisted outbox events by status.',
    '# TYPE noter_outbox_events gauge',
    ...OUTBOX_STATUSES.map((status) => `noter_outbox_events{status="${status}"} ${snapshot.outbox[status]}`),
    '# HELP noter_transcriptions Number of media transcriptions by processing state.',
    '# TYPE noter_transcriptions gauge',
    ...PROCESSING_STATES.map((state) => `noter_transcriptions{state="${state}"} ${snapshot.transcriptions[state]}`),
    '# HELP noter_analyses Number of AI analyses by processing state.',
    '# TYPE noter_analyses gauge',
    ...PROCESSING_STATES.map((state) => `noter_analyses{state="${state}"} ${snapshot.analyses[state]}`),
    '# HELP noter_media_deletion_tasks Number of durable media deletion tasks.',
    '# TYPE noter_media_deletion_tasks gauge',
    `noter_media_deletion_tasks ${snapshot.mediaDeletionTasks}`,
    '# HELP noter_oldest_pending_age_seconds Age of the oldest pending item by pipeline.',
    '# TYPE noter_oldest_pending_age_seconds gauge',
    `noter_oldest_pending_age_seconds{pipeline="outbox"} ${formatNumber(snapshot.oldestPendingOutboxAgeSeconds)}`,
    `noter_oldest_pending_age_seconds{pipeline="transcription"} ${formatNumber(snapshot.oldestPendingTranscriptionAgeSeconds)}`,
    `noter_oldest_pending_age_seconds{pipeline="analysis"} ${formatNumber(snapshot.oldestPendingAnalysisAgeSeconds)}`,
    '# HELP noter_queue_jobs Number of BullMQ jobs by queue and state.',
    '# TYPE noter_queue_jobs gauge',
    ...QUEUE_NAMES.flatMap((queue) => QUEUE_STATES.map((state) => (
      `noter_queue_jobs{queue="${queue}",state="${state}"} ${snapshot.queues[queue][state]}`
    ))),
  ];
  return `${lines.join('\n')}\n`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return value.toFixed(3).replace(/\.000$/, '');
}
