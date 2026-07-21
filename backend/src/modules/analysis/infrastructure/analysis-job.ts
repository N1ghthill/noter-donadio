import { z } from 'zod';

const analysisJobSchema = z.object({
  workspaceId: z.uuid(),
  messageId: z.uuid(),
  negotiationId: z.uuid(),
}).strict();

const SUPPORTED_EVENTS = ['message.text.ingested', 'message.audio.ready_for_analysis'] as const;

export interface MessageAnalysisJob {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly negotiationId: string;
}

export function parseMessageAnalysisJob(name: string, data: unknown): MessageAnalysisJob {
  if (!SUPPORTED_EVENTS.some((event) => event === name)) throw new Error('unsupported_analysis_job');
  return analysisJobSchema.parse(data);
}
