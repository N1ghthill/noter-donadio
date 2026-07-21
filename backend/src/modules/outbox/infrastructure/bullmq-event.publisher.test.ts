import assert from 'node:assert/strict';
import test from 'node:test';

import { eventJobOptions } from './bullmq-event.publisher.js';

test('áudio mantém retries suficientes para recuperar um lease abandonado', () => {
  const options = eventJobOptions('message.audio.ingested', 'event-1');
  assert.equal(options.jobId, 'event-1');
  assert.equal(options.attempts, 12);
  assert.deepEqual(options.backoff, { type: 'fixed', delay: 30_000 });
});

test('análise de texto e de áudio transcrito usa a mesma janela de recuperação', () => {
  for (const eventType of ['message.text.ingested', 'message.audio.ready_for_analysis']) {
    const options = eventJobOptions(eventType, 'event-analysis');
    assert.equal(options.attempts, 12);
    assert.deepEqual(options.backoff, { type: 'fixed', delay: 30_000 });
  }
});

test('demais eventos preservam retry exponencial curto', () => {
  const options = eventJobOptions('contact.updated', 'event-2');
  assert.equal(options.attempts, 3);
  assert.deepEqual(options.backoff, { type: 'exponential', delay: 1_000 });
});
