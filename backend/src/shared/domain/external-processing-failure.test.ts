import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyExternalProcessingFailure } from './external-processing-failure.js';

test('classifica falhas externas sem depender de mensagem potencialmente sensível', () => {
  assert.equal(classifyExternalProcessingFailure({ status: 401 }), 'AUTHENTICATION_FAILED');
  assert.equal(classifyExternalProcessingFailure({ status: 429 }), 'RATE_LIMITED');
  assert.equal(classifyExternalProcessingFailure({ status: 503 }), 'PROVIDER_UNAVAILABLE');
  assert.equal(classifyExternalProcessingFailure(Object.assign(new Error(), { name: 'APIConnectionTimeoutError' })), 'TIMEOUT');
  assert.equal(classifyExternalProcessingFailure(Object.assign(new Error(), { name: 'MissingStructuredOutputError' })), 'OUTPUT_INVALID');
  assert.equal(classifyExternalProcessingFailure(new Error('conteúdo que não pode ir ao log')), 'PROCESSING_FAILED');
});
