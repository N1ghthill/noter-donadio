import { randomUUID } from 'node:crypto';

import { NEGOTIATION_STAGES, type NegotiationStage } from '@noter/contracts';

const LEASE_DURATION_MS = 5 * 60 * 1_000;
const PROMPT_VERSION = 'message-extraction-v1';
const ANALYSIS_TYPE = 'message_extraction';
const SENTIMENTS = ['positive', 'neutral', 'negative', 'urgent'] as const;
type AnalysisSentiment = (typeof SENTIMENTS)[number];

export interface MessageAnalysisTarget {
  readonly analysisId: string;
  readonly workspaceId: string;
  readonly messageId: string;
  readonly negotiationId: string;
  readonly attemptId: string;
  readonly direction: 'inbound' | 'outbound';
  readonly text: string;
  readonly promptVersion: string;
}

export interface MessageAnalysisResult {
  readonly summary: string | null;
  readonly entities: {
    readonly product: string | null;
    readonly amount: string | null;
    readonly deadline: string | null;
  };
  readonly sentiment: AnalysisSentiment | null;
  readonly sentimentConfidence: number | null;
  readonly objections: readonly string[];
  readonly nextActions: readonly string[];
  readonly suggestedTags: readonly string[];
  readonly suggestedStage: NegotiationStage | null;
  readonly confidence: number | null;
  readonly model: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
}

export type MessageAnalysisClaim =
  | { readonly status: 'claimed'; readonly target: MessageAnalysisTarget }
  | { readonly status: 'completed' | 'busy' | 'missing' };

export interface MessageAnalysisRepository {
  claim(input: {
    workspaceId: string;
    messageId: string;
    analysisType: string;
    promptVersion: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
  }): Promise<MessageAnalysisClaim>;
  complete(input: MessageAnalysisTarget & MessageAnalysisResult & {
    processingTimeMs: number;
  }): Promise<boolean>;
  fail(input: MessageAnalysisTarget & { failureCode: string }): Promise<void>;
}

export interface MessageAnalyzer {
  analyze(input: {
    text: string;
    direction: 'inbound' | 'outbound';
    promptVersion: string;
  }): Promise<unknown>;
}

export class MessageAnalysisService {
  public constructor(
    private readonly repository: MessageAnalysisRepository,
    private readonly analyzer: MessageAnalyzer,
  ) {}

  public async execute(workspaceId: string, messageId: string, now = new Date()) {
    const claim = await this.repository.claim({
      workspaceId,
      messageId,
      analysisType: ANALYSIS_TYPE,
      promptVersion: PROMPT_VERSION,
      attemptId: randomUUID(),
      now,
      staleBefore: new Date(now.getTime() - LEASE_DURATION_MS),
    });
    if (claim.status !== 'claimed') {
      return { status: claim.status === 'completed' ? 'already_completed' : claim.status } as const;
    }

    const startedAt = Date.now();
    try {
      const result = parseMessageAnalysisResult(await this.analyzer.analyze({
        text: claim.target.text,
        direction: claim.target.direction,
        promptVersion: claim.target.promptVersion,
      }));
      const completed = await this.repository.complete({
        ...claim.target,
        ...result,
        processingTimeMs: Math.max(0, Date.now() - startedAt),
      });
      return { status: completed ? 'completed' : 'busy' } as const;
    } catch {
      await this.repository.fail({
        ...claim.target,
        failureCode: 'ANALYSIS_PROCESSING_FAILED',
      });
      throw new MessageAnalysisFailedError();
    }
  }
}

export class MessageAnalysisFailedError extends Error {
  public constructor() {
    super('Falha no processamento da análise');
    this.name = 'MessageAnalysisFailedError';
  }
}

export function parseMessageAnalysisResult(value: unknown): MessageAnalysisResult {
  const result = record(value, 'analysis');
  exactKeys(result, [
    'summary', 'entities', 'sentiment', 'sentimentConfidence', 'objections', 'nextActions',
    'suggestedTags', 'suggestedStage', 'confidence', 'model', 'promptTokens', 'completionTokens',
  ]);
  const entities = record(result.entities, 'entities');
  exactKeys(entities, ['product', 'amount', 'deadline']);
  return {
    summary: nullableString(result.summary, 10_000),
    entities: {
      product: nullableString(entities.product, 500),
      amount: nullableString(entities.amount, 100),
      deadline: nullableString(entities.deadline, 100),
    },
    sentiment: nullableEnum(result.sentiment, SENTIMENTS),
    sentimentConfidence: nullableConfidence(result.sentimentConfidence),
    objections: stringArray(result.objections, 20, 500),
    nextActions: stringArray(result.nextActions, 20, 500),
    suggestedTags: stringArray(result.suggestedTags, 20, 50),
    suggestedStage: nullableEnum(result.suggestedStage, NEGOTIATION_STAGES),
    confidence: nullableConfidence(result.confidence),
    model: requiredString(result.model, 100),
    promptTokens: nullableNonnegativeInteger(result.promptTokens),
    completionTokens: nullableNonnegativeInteger(result.completionTokens),
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`invalid_${name}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('unexpected_analysis_fields');
  }
}

function requiredString(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error('invalid_analysis_string');
  }
  return value.trim();
}

function nullableString(value: unknown, max: number): string | null {
  return value === null ? null : requiredString(value, max);
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error('invalid_analysis_array');
  return value.map((item) => requiredString(item, maxLength));
}

function nullableConfidence(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('invalid_analysis_confidence');
  }
  return value;
}

function nullableNonnegativeInteger(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('invalid_analysis_tokens');
  }
  return value;
}

function nullableEnum<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !values.includes(value)) throw new Error('invalid_analysis_enum');
  return value as T[number];
}
