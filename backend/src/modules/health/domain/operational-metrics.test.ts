import assert from 'node:assert/strict';
import test from 'node:test';

import { renderPrometheusMetrics, type OperationalMetricsSnapshot } from './operational-metrics.js';

const snapshot: OperationalMetricsSnapshot = {
  pipelinesEnabled: {
    media_download: true,
    transcription: false,
    analysis: true,
    notification: true,
  },
  outbox: { pending: 2, processing: 1, published: 8, failed: 0 },
  mediaDownloads: { pending: 1, processing: 0, completed: 4, failed: 0 },
  transcriptions: { pending: 1, processing: 0, completed: 4, failed: 1 },
  analyses: { pending: 3, processing: 1, completed: 9, failed: 0 },
  notifications: { pending: 1, processing: 0, completed: 8, failed: 1 },
  mediaDeletionTasks: 2,
  oldestPendingOutboxAgeSeconds: 12.5,
  oldestPendingMediaDownloadAgeSeconds: 2,
  oldestPendingTranscriptionAgeSeconds: 0,
  oldestPendingAnalysisAgeSeconds: 60,
  oldestPendingNotificationAgeSeconds: 4,
  queues: {
    'ai-processing': { waiting: 2, active: 1, delayed: 0, failed: 0, paused: 0 },
    'media-download': { waiting: 1, active: 0, delayed: 0, failed: 0, paused: 0 },
    'audio-transcription': { waiting: 1, active: 0, delayed: 1, failed: 0, paused: 0 },
    'realtime-events': { waiting: 0, active: 0, delayed: 0, failed: 1, paused: 0 },
    'inbound-notifications': { waiting: 1, active: 0, delayed: 1, failed: 0, paused: 0 },
  },
};

test('renderiza métricas Prometheus com cardinalidade fechada e sem identificadores', () => {
  const result = renderPrometheusMetrics(snapshot);

  assert.match(result, /noter_outbox_events\{status="pending"\} 2/);
  assert.match(result, /noter_media_downloads\{state="pending"\} 1/);
  assert.match(result, /noter_oldest_pending_age_seconds\{pipeline="outbox"\} 12\.500/);
  assert.match(result, /noter_queue_jobs\{queue="ai-processing",state="active"\} 1/);
  assert.match(result, /noter_pipeline_enabled\{pipeline="transcription"\} 0/);
  assert.match(result, /noter_notifications\{state="completed"\} 8/);
  assert.doesNotMatch(result, /workspace|message|contact|phone/i);
  assert.equal(result.endsWith('\n'), true);
});
