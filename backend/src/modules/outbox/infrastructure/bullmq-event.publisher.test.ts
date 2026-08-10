import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eventJobOptions,
  notificationJobOptions,
  notificationJobPayload,
  notificationMilestoneFor,
} from './bullmq-event.publisher.js';

test('áudio mantém retries suficientes para recuperar um lease abandonado', () => {
  const options = eventJobOptions('message.audio.ingested', 'event-1');
  assert.equal(options.jobId, 'event-1');
  assert.equal(options.attempts, 12);
  assert.deepEqual(options.backoff, { type: 'fixed', delay: 30_000 });
});

test('download de mídia usa política longa sem transportar conteúdo', () => {
  const options = eventJobOptions('message.audio.download_requested', 'event-download');
  assert.equal(options.attempts, 12);
  assert.deepEqual(options.backoff, { type: 'fixed', delay: 30_000 });
});

test('download genérico de mídia preserva retries longos', () => {
  const options = eventJobOptions('message.media.download_requested', 'event-media');
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

test('notificação tolera lease abandonado sem transportar conteúdo', () => {
  const options = notificationJobOptions('event-notification', 'message_received');
  assert.equal(options.jobId, 'event-notification');
  assert.equal(options.attempts, 12);
  assert.deepEqual(options.backoff, { type: 'fixed', delay: 30_000 });
  assert.equal(options.delay, 60_000);
});

test('fila de notificação recebe somente IDs mínimos', () => {
  assert.deepEqual(notificationJobPayload({
    workspaceId: 'workspace-1',
    messageId: 'message-1',
    contactId: 'contact-1',
    negotiationId: 'negotiation-1',
    content: 'não deve trafegar',
  }, 'analysis_completed'), {
    workspaceId: 'workspace-1',
    messageId: 'message-1',
    milestone: 'analysis_completed',
  });
});

test('mapeia somente marcos úteis e posterga alertas de falha', () => {
  assert.equal(notificationMilestoneFor('message.persisted', {}), 'message_received');
  assert.equal(
    notificationMilestoneFor('analysis.changed', { state: 'completed' }),
    'analysis_completed',
  );
  assert.equal(
    notificationMilestoneFor('analysis.changed', { state: 'failed' }),
    'analysis_attention',
  );
  assert.equal(
    notificationMilestoneFor('message.transcription.changed', { state: 'failed' }),
    'transcription_attention',
  );
  assert.equal(
    notificationMilestoneFor('message.transcription.changed', { state: 'completed' }),
    null,
  );
  assert.equal(notificationJobOptions('failure', 'analysis_attention').delay, 600_000);
  assert.equal(notificationJobOptions('analysis', 'analysis_completed').delay, undefined);
});
