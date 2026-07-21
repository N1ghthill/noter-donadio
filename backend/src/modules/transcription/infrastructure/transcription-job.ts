import { z } from 'zod';

const audioJobSchema = z.object({
  workspaceId: z.uuid(),
  messageId: z.uuid(),
  negotiationId: z.uuid(),
}).strict();

export interface AudioTranscriptionJob {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly negotiationId: string;
}

export function parseAudioTranscriptionJob(name: string, data: unknown): AudioTranscriptionJob {
  if (name !== 'message.audio.ingested') throw new Error('unsupported_transcription_job');
  return audioJobSchema.parse(data);
}
