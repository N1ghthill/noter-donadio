import { randomUUID } from 'node:crypto';

const LEASE_DURATION_MS = 5 * 60 * 1_000;
const MAX_TRANSCRIPTION_LENGTH = 100_000;

export interface AudioTranscriptionTarget {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly attemptId: string;
  readonly durationSeconds: number | null;
  readonly mimeType: string | null;
}

export interface AudioTranscriptionResult {
  readonly text: string;
  readonly language: string;
  readonly model: string;
  readonly confidence: number | null;
}

export type TranscriptionClaim =
  | { readonly status: 'claimed'; readonly target: AudioTranscriptionTarget }
  | { readonly status: 'completed' | 'busy' | 'missing' };

export interface AudioTranscriptionRepository {
  claim(input: {
    workspaceId: string;
    messageId: string;
    attemptId: string;
    now: Date;
    staleBefore: Date;
  }): Promise<TranscriptionClaim>;
  complete(input: AudioTranscriptionTarget & AudioTranscriptionResult & { completedAt: Date }): Promise<boolean>;
  fail(input: AudioTranscriptionTarget & { failureCode: string }): Promise<void>;
}

export interface AudioTranscriber {
  transcribe(target: AudioTranscriptionTarget): Promise<AudioTranscriptionResult>;
}

export interface AudioTranscriptionExecution {
  readonly status: 'completed' | 'already_completed' | 'busy' | 'missing';
}

export class AudioTranscriptionService {
  public constructor(
    private readonly repository: AudioTranscriptionRepository,
    private readonly transcriber: AudioTranscriber,
  ) {}

  public async execute(
    workspaceId: string,
    messageId: string,
    now = new Date(),
  ): Promise<AudioTranscriptionExecution> {
    const claim = await this.repository.claim({
      workspaceId,
      messageId,
      attemptId: randomUUID(),
      now,
      staleBefore: new Date(now.getTime() - LEASE_DURATION_MS),
    });

    if (claim.status !== 'claimed') {
      return { status: claim.status === 'completed' ? 'already_completed' : claim.status };
    }

    try {
      const result = validateResult(await this.transcriber.transcribe(claim.target));
      const completed = await this.repository.complete({
        ...claim.target,
        ...result,
        completedAt: new Date(),
      });
      return { status: completed ? 'completed' : 'busy' };
    } catch {
      await this.repository.fail({
        ...claim.target,
        failureCode: 'TRANSCRIPTION_PROCESSING_FAILED',
      });
      throw new AudioTranscriptionFailedError();
    }
  }
}

export class AudioTranscriptionFailedError extends Error {
  public constructor() {
    super('Falha no processamento da transcrição');
    this.name = 'AudioTranscriptionFailedError';
  }
}

export function validateResult(result: AudioTranscriptionResult): AudioTranscriptionResult {
  const text = result.text.trim();
  const language = result.language.trim();
  const model = result.model.trim();
  if (!text || text.length > MAX_TRANSCRIPTION_LENGTH) throw new Error('invalid_transcription_text');
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) throw new Error('invalid_transcription_language');
  if (!model || model.length > 100) throw new Error('invalid_transcription_model');
  if (result.confidence !== null && (result.confidence < 0 || result.confidence > 1)) {
    throw new Error('invalid_transcription_confidence');
  }
  return { ...result, text, language, model };
}
