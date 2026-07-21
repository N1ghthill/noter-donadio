import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMessageAnalysisJob } from './analysis-job.js';

const payload = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
  negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
};

test('jobs de texto e áudio aceitam somente identificadores', () => {
  assert.deepEqual(parseMessageAnalysisJob('message.text.ingested', payload), payload);
  assert.deepEqual(parseMessageAnalysisJob('message.audio.ready_for_analysis', payload), payload);
  assert.throws(() => parseMessageAnalysisJob('message.text.ingested', {
    ...payload,
    content: 'conteúdo proibido no job',
  }));
});

test('evento desconhecido é recusado', () => {
  assert.throws(() => parseMessageAnalysisJob('message.video.ingested', payload), /unsupported_analysis_job/);
});
