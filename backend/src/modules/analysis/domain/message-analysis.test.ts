import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MessageAnalysisFailedError,
  MessageAnalysisService,
  parseMessageAnalysisResult,
  type MessageAnalysisRepository,
  type MessageAnalysisTarget,
  type MessageAnalyzer,
} from './message-analysis.js';

const TARGET: MessageAnalysisTarget = {
  analysisId: '87507894-44d7-4127-a909-89358db1944a',
  workspaceId: '0e723f84-ec81-441e-b816-f3f179f25fe2',
  messageId: 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227',
  negotiationId: 'db71084e-5829-4a90-8346-5832998294ea',
  attemptId: 'bcf87290-5230-4db5-84bb-3facdca61368',
  direction: 'inbound',
  text: 'Mensagem inteiramente fictícia.',
  promptVersion: 'message-extraction-v1',
};

const VALID_RESULT = {
  summary: 'Resumo fictício.',
  entities: { product: null, amount: null, deadline: null },
  sentiment: 'neutral',
  sentimentConfidence: 0.9,
  objections: [],
  nextActions: ['Revisar a conversa'],
  suggestedTags: ['análise-simulada'],
  suggestedStage: null,
  confidence: 0.85,
  model: 'fake-local-v1',
  promptTokens: 0,
  completionTokens: 0,
};

test('conclui análise válida sem aplicar sugestões ao CRM', async () => {
  let completed: Parameters<MessageAnalysisRepository['complete']>[0] | undefined;
  const repository: MessageAnalysisRepository = {
    async claim() { return { status: 'claimed', target: TARGET }; },
    async complete(input) { completed = input; return true; },
    async fail() { throw new Error('não deveria falhar'); },
  };
  const analyzer: MessageAnalyzer = { async analyze() { return VALID_RESULT; } };

  const result = await new MessageAnalysisService(repository, analyzer)
    .execute(TARGET.workspaceId, TARGET.messageId);

  assert.deepEqual(result, { status: 'completed' });
  assert.equal(completed?.suggestedStage, null);
  assert.equal(completed?.promptVersion, 'message-extraction-v1');
});

test('reentrega concluída não chama o adapter', async () => {
  let called = false;
  const repository: MessageAnalysisRepository = {
    async claim() { return { status: 'completed' }; },
    async complete() { return false; },
    async fail() {},
  };
  const analyzer: MessageAnalyzer = {
    async analyze() { called = true; return VALID_RESULT; },
  };
  const result = await new MessageAnalysisService(repository, analyzer)
    .execute(TARGET.workspaceId, TARGET.messageId);
  assert.deepEqual(result, { status: 'already_completed' });
  assert.equal(called, false);
});

test('mensagem anterior ao corte não chama o adapter externo', async () => {
  let called = false;
  const repository: MessageAnalysisRepository = {
    async claim(input) {
      assert.equal(input.notBefore?.toISOString(), '2026-07-29T00:00:00.000Z');
      return { status: 'ineligible' };
    },
    async complete() { return false; },
    async fail() {},
  };
  const analyzer: MessageAnalyzer = {
    async analyze() { called = true; return VALID_RESULT; },
  };

  const result = await new MessageAnalysisService(
    repository,
    analyzer,
    new Date('2026-07-29T00:00:00.000Z'),
  ).execute(TARGET.workspaceId, TARGET.messageId);

  assert.deepEqual(result, { status: 'skipped' });
  assert.equal(called, false);
});

test('saída com campo extra é recusada e falha com código sanitizado', async () => {
  let failureCode: string | undefined;
  const repository: MessageAnalysisRepository = {
    async claim() { return { status: 'claimed', target: TARGET }; },
    async complete() { return true; },
    async fail(input) { failureCode = input.failureCode; },
  };
  const analyzer: MessageAnalyzer = {
    async analyze() { return { ...VALID_RESULT, autonomousAction: 'move_pipeline' }; },
  };
  await assert.rejects(
    new MessageAnalysisService(repository, analyzer).execute(TARGET.workspaceId, TARGET.messageId),
    MessageAnalysisFailedError,
  );
  assert.equal(failureCode, 'ANALYSIS_PROCESSING_FAILED');
});

test('parser recusa confiança, etapa e entidades fora do contrato', () => {
  assert.throws(() => parseMessageAnalysisResult({ ...VALID_RESULT, confidence: 2 }));
  assert.throws(() => parseMessageAnalysisResult({ ...VALID_RESULT, suggestedStage: 'invented' }));
  assert.throws(() => parseMessageAnalysisResult({
    ...VALID_RESULT,
    entities: { ...VALID_RESULT.entities, secret: 'extra' },
  }));
});
