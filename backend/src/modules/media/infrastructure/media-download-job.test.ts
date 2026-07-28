import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMediaDownloadJob } from './media-download-job.js';

const payload = {
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: '71eb08da-e9a7-41a2-97bd-e1bd6780802b',
  negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
};

test('job de download transporta somente identificadores internos', () => {
  assert.deepEqual(parseMediaDownloadJob('message.audio.download_requested', payload), payload);
  assert.throws(
    () => parseMediaDownloadJob('message.audio.download_requested', {
      ...payload,
      externalMediaId: 'referencia-que-nao-deve-ir-para-a-fila',
    }),
  );
});

test('recusa evento desconhecido', () => {
  assert.throws(
    () => parseMediaDownloadJob('message.audio.ingested', payload),
    /unsupported_media_download_job/,
  );
});
