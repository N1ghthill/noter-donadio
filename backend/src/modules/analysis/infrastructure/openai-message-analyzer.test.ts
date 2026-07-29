import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AnalysisInputLimitExceededError,
  MissingStructuredOutputError,
  OpenAIMessageAnalyzer,
  UnsupportedPromptVersionError,
} from './openai-message-analyzer.js';

const EXTRACTION = {
  summary: 'Cliente pediu uma proposta.',
  entities: { product: 'Plano fictício', amount: null, deadline: null },
  sentiment: 'neutral' as const,
  sentimentConfidence: 0.8,
  objections: [],
  nextActions: ['Preparar proposta para revisão humana'],
  suggestedTags: ['proposta'],
  suggestedStage: 'qualified' as const,
  confidence: 0.85,
};

test('usa saída estruturada sem armazenar a resposta no provedor', async () => {
  let request: { store: false; input: string } | undefined;
  const analyzer = new OpenAIMessageAnalyzer(
    {
      async parse(input) {
        request = input;
        return {
          output_parsed: EXTRACTION,
          model: 'gpt-5.6-sol',
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      },
    },
    { model: 'gpt-5.6-sol', maxOutputTokens: 1_000 },
  );

  const result = await analyzer.analyze({
    text: 'Quero uma proposta do plano fictício.',
    direction: 'inbound',
    promptVersion: 'message-extraction-v1',
  });

  assert.equal(request?.store, false);
  assert.match(request?.input ?? '', /<mensagem>/);
  assert.deepEqual(result, {
    ...EXTRACTION,
    model: 'gpt-5.6-sol',
    promptTokens: 100,
    completionTokens: 50,
  });
});

test('falha fechada para entrada excessiva, prompt desconhecido e recusa sem payload', async () => {
  const analyzer = new OpenAIMessageAnalyzer(
    {
      async parse() {
        return { output_parsed: null, model: 'gpt-5.6-sol' };
      },
    },
    { model: 'gpt-5.6-sol', maxOutputTokens: 1_000 },
  );

  await assert.rejects(analyzer.analyze({
    text: 'x'.repeat(20_001),
    direction: 'inbound',
    promptVersion: 'message-extraction-v1',
  }), AnalysisInputLimitExceededError);
  await assert.rejects(analyzer.analyze({
    text: 'Mensagem fictícia.',
    direction: 'inbound',
    promptVersion: 'v2-inexistente',
  }), UnsupportedPromptVersionError);
  await assert.rejects(analyzer.analyze({
    text: 'Mensagem fictícia.',
    direction: 'inbound',
    promptVersion: 'message-extraction-v1',
  }), MissingStructuredOutputError);
});
