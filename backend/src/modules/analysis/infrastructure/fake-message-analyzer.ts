import type { MessageAnalysisContext, MessageAnalyzer } from '../domain/message-analysis.js';

export class FakeMessageAnalyzer implements MessageAnalyzer {
  public async analyze(_input: {
    text: string;
    direction: 'inbound' | 'outbound';
    promptVersion: string;
    context: MessageAnalysisContext;
  }): Promise<unknown> {
    return {
      summary: 'Análise simulada da mensagem mais recente.',
      entities: { product: null, amount: null, deadline: null },
      sentiment: 'neutral',
      sentimentConfidence: 0.9,
      objections: [],
      nextActions: ['Revisar a conversa e definir o próximo contato'],
      suggestedTags: ['análise-simulada'],
      suggestedStage: null,
      confidence: 0.85,
      routing: {
        interactionType: 'unclear',
        relatedCaseRefs: [],
        cases: [],
        routingConfidence: null,
        needsHumanReview: true,
      },
      model: 'fake-local-v1',
      promptTokens: 0,
      completionTokens: 0,
    };
  }
}
