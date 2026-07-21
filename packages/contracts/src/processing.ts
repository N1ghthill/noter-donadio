export const PROCESSING_STATES = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

export type ProcessingState = (typeof PROCESSING_STATES)[number];
