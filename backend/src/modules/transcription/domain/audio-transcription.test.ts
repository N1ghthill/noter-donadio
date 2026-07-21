import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AudioTranscriptionFailedError,
  AudioTranscriptionService,
  type AudioTranscriber,
  type AudioTranscriptionRepository,
  type AudioTranscriptionTarget,
} from './audio-transcription.js';

const TARGET: AudioTranscriptionTarget = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
  attemptId: 'bcf87290-5230-4db5-84bb-3facdca61368',
  durationSeconds: 18,
  mimeType: 'audio/ogg',
};

test('conclui uma transcrição válida usando o lease adquirido', async () => {
  let completedAttempt: string | undefined;
  const repository: AudioTranscriptionRepository = {
    async claim() { return { status: 'claimed', target: TARGET }; },
    async complete(input) { completedAttempt = input.attemptId; return true; },
    async fail() { throw new Error('não deveria falhar'); },
  };
  const transcriber: AudioTranscriber = {
    async transcribe() {
      return { text: ' Transcrição fictícia. ', language: 'pt-BR', model: 'fake-local-v1', confidence: 0.99 };
    },
  };

  const result = await new AudioTranscriptionService(repository, transcriber)
    .execute(TARGET.workspaceId, TARGET.messageId);

  assert.deepEqual(result, { status: 'completed' });
  assert.equal(completedAttempt, TARGET.attemptId);
});

test('reentrega não chama o adapter quando a transcrição já terminou', async () => {
  let called = false;
  const repository: AudioTranscriptionRepository = {
    async claim() { return { status: 'completed' }; },
    async complete() { return false; },
    async fail() {},
  };
  const transcriber: AudioTranscriber = {
    async transcribe() { called = true; throw new Error('não deveria executar'); },
  };

  const result = await new AudioTranscriptionService(repository, transcriber)
    .execute(TARGET.workspaceId, TARGET.messageId);

  assert.deepEqual(result, { status: 'already_completed' });
  assert.equal(called, false);
});

test('saída inválida falha com código sanitizado e permite retry', async () => {
  let failureCode: string | undefined;
  const repository: AudioTranscriptionRepository = {
    async claim() { return { status: 'claimed', target: TARGET }; },
    async complete() { return true; },
    async fail(input) { failureCode = input.failureCode; },
  };
  const transcriber: AudioTranscriber = {
    async transcribe() {
      return { text: '', language: 'invalida', model: '', confidence: 2 };
    },
  };

  await assert.rejects(
    new AudioTranscriptionService(repository, transcriber).execute(TARGET.workspaceId, TARGET.messageId),
    AudioTranscriptionFailedError,
  );
  assert.equal(failureCode, 'TRANSCRIPTION_PROCESSING_FAILED');
});
