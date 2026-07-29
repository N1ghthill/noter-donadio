import assert from 'node:assert/strict';
import test from 'node:test';

import type { MediaStorage } from '../../media/domain/media-storage.js';
import type { AudioTranscriptionTarget } from '../domain/audio-transcription.js';
import {
  AudioDurationLimitExceededError,
  OpenAIAudioTranscriber,
  UnsupportedAudioFormatError,
} from './openai-audio-transcriber.js';

const TARGET: AudioTranscriptionTarget = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
  attemptId: 'bcf87290-5230-4db5-84bb-3facdca61368',
  storageKey: '0e723f84-ec81-441e-b816-f3f179f25fe2/fbdff1c4-5a25-4e24-b694-d5dc6c21f227.media',
  durationSeconds: 12,
  mimeType: 'audio/ogg; codecs=opus',
};

const storage: MediaStorage = {
  async write() {},
  async read() { return Buffer.from('audio fictício'); },
  async delete() {},
};

test('envia somente o arquivo necessário e normaliza metadados da transcrição', async () => {
  let received: { file: File; model: string; language: string } | undefined;
  const transcriber = new OpenAIAudioTranscriber(
    {
      async create(input) {
        received = input;
        return {
          text: 'Transcrição fictícia.',
          logprobs: [{ logprob: Math.log(0.8) }, { logprob: Math.log(0.8) }],
        };
      },
    },
    storage,
    {
      model: 'gpt-4o-mini-transcribe',
      language: 'pt',
      persistedLanguage: 'pt-BR',
      maxDurationSeconds: 300,
    },
  );

  const result = await transcriber.transcribe(TARGET);

  assert.equal(received?.file.name, 'audio.ogg');
  assert.equal(received?.file.type, 'audio/ogg');
  assert.equal(received?.model, 'gpt-4o-mini-transcribe');
  assert.equal(received?.language, 'pt');
  assert.equal(result.text, 'Transcrição fictícia.');
  assert.equal(result.confidence, 0.8);
});

test('recusa duração e formato fora da política antes de chamar o provedor', async () => {
  let calls = 0;
  const transcriber = new OpenAIAudioTranscriber(
    { async create() { calls += 1; return { text: 'não deveria executar' }; } },
    storage,
    {
      model: 'gpt-4o-mini-transcribe',
      language: 'pt',
      persistedLanguage: 'pt-BR',
      maxDurationSeconds: 30,
    },
  );

  await assert.rejects(
    transcriber.transcribe({ ...TARGET, durationSeconds: 31 }),
    AudioDurationLimitExceededError,
  );
  await assert.rejects(
    transcriber.transcribe({ ...TARGET, mimeType: 'audio/aac' }),
    UnsupportedAudioFormatError,
  );
  assert.equal(calls, 0);
});
