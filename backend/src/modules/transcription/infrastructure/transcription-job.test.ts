import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAudioTranscriptionJob } from './transcription-job.js';

const payload = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
  negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
};

test('job de transcrição aceita somente identificadores', () => {
  assert.deepEqual(parseAudioTranscriptionJob('message.audio.ingested', payload), payload);
  assert.throws(
    () => parseAudioTranscriptionJob('message.audio.ingested', { ...payload, audio: 'conteúdo proibido' }),
  );
});

test('job desconhecido é recusado', () => {
  assert.throws(
    () => parseAudioTranscriptionJob('message.text.ingested', payload),
    /unsupported_transcription_job/,
  );
});
