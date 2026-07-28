import { z } from 'zod';

const mediaDownloadJobSchema = z.object({
  workspaceId: z.uuid(),
  messageId: z.uuid(),
  negotiationId: z.uuid(),
}).strict();

export interface MediaDownloadJob {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly negotiationId: string;
}

export function parseMediaDownloadJob(name: string, data: unknown): MediaDownloadJob {
  if (name !== 'message.audio.download_requested') {
    throw new Error('unsupported_media_download_job');
  }
  return mediaDownloadJobSchema.parse(data);
}
