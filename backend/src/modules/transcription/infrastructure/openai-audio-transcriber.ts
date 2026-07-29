import { toFile } from 'openai';

import type { MediaStorage } from '../../media/domain/media-storage.js';
import type {
  AudioTranscriber,
  AudioTranscriptionResult,
  AudioTranscriptionTarget,
} from '../domain/audio-transcription.js';

const SUPPORTED_EXTENSIONS = new Map([
  ['audio/flac', 'flac'],
  ['audio/m4a', 'm4a'],
  ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mpga', 'mpga'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/webm', 'webm'],
]);

interface OpenAITranscriptionResponse {
  readonly text: string;
  readonly logprobs?: readonly { readonly logprob?: number | undefined }[] | undefined;
}

interface OpenAITranscriptionsClient {
  create(input: {
    file: File;
    model: string;
    language: string;
    response_format: 'json';
    include: ['logprobs'];
  }): Promise<OpenAITranscriptionResponse>;
}

export interface OpenAIAudioTranscriberOptions {
  readonly model: string;
  readonly language: string;
  readonly persistedLanguage: string;
  readonly maxDurationSeconds: number;
}

export class OpenAIAudioTranscriber implements AudioTranscriber {
  public constructor(
    private readonly client: OpenAITranscriptionsClient,
    private readonly storage: MediaStorage,
    private readonly options: OpenAIAudioTranscriberOptions,
  ) {}

  public async transcribe(target: AudioTranscriptionTarget): Promise<AudioTranscriptionResult> {
    if (target.durationSeconds !== null
      && target.durationSeconds > this.options.maxDurationSeconds) {
      throw new AudioDurationLimitExceededError();
    }

    const mimeType = normalizeMimeType(target.mimeType);
    const extension = SUPPORTED_EXTENSIONS.get(mimeType);
    if (!extension) throw new UnsupportedAudioFormatError();

    const bytes = await this.storage.read(target.storageKey);
    const file = await toFile(bytes, `audio.${extension}`, { type: mimeType });
    const response = await this.client.create({
      file,
      model: this.options.model,
      language: this.options.language,
      response_format: 'json',
      include: ['logprobs'],
    });

    return {
      text: response.text,
      language: this.options.persistedLanguage,
      model: this.options.model,
      confidence: confidenceFromLogprobs(response.logprobs),
    };
  }
}

export class AudioDurationLimitExceededError extends Error {}
export class UnsupportedAudioFormatError extends Error {}

function normalizeMimeType(value: string | null): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function confidenceFromLogprobs(
  logprobs: readonly { readonly logprob?: number | undefined }[] | undefined,
): number | null {
  const values = logprobs
    ?.map((item) => item.logprob)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (!values?.length) return null;
  const averageLogprob = values.reduce((total, value) => total + value, 0) / values.length;
  return Math.min(1, Math.max(0, Math.exp(averageLogprob)));
}
