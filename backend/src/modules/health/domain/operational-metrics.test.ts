import assert from 'node:assert/strict';
import test from 'node:test';

import { renderPrometheusMetrics, type OperationalMetricsSnapshot } from './operational-metrics.js';

const snapshot: OperationalMetricsSnapshot = {
  outbox: { pending: 2, processing: 1, published: 8, failed: 0 },
  transcriptions: { pending: 1, processing: 0, completed: 4, failed: 1 },
  analyses: { pending: 3, processing: 1, completed: 9, failed: 0 },
  mediaDeletionTasks: 2,
  oldestPendingOutboxAgeSeconds: 12.5,
  oldestPendingTranscriptionAgeSeconds: 0,
  oldestPendingAnalysisAgeSeconds: 60,
  queues: {
    'ai-processing': { waiting: 2, active: 1, delayed: 0, failed: 0, paused: 0 },
    'audio-transcription': { waiting: 1, active: 0, delayed: 1, failed: 0, paused: 0 },
    'realtime-events': { waiting: 0, active: 0, delayed: 0, failed: 1, paused: 0 },
  },
};

test('renderiza métricas Prometheus com cardinalidade fechada e sem identificadores', () => {
  const result = renderPrometheusMetrics(snapshot);

  assert.match(result, /noter_outbox_events\{status="pending"\} 2/);
  assert.match(result, /noter_oldest_pending_age_seconds\{pipeline="outbox"\} 12\.500/);
  assert.match(result, /noter_queue_jobs\{queue="ai-processing",state="active"\} 1/);
  assert.doesNotMatch(result, /workspace|message|contact|phone/i);
  assert.equal(result.endsWith('\n'), true);
});
