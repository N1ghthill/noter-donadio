export const PROCESSING_KINDS = ['analysis', 'transcription'] as const;
export type ProcessingKind = (typeof PROCESSING_KINDS)[number];

export interface ProcessingFailure {
  readonly id: string;
  readonly kind: ProcessingKind;
  readonly messageId: string;
  readonly negotiationId: string;
  readonly contactName: string;
  readonly failureCode: string;
  readonly failedAt: string;
  readonly retryEligible: boolean;
}

export type ProcessingRetryResult = 'queued' | 'missing' | 'not_failed' | 'ineligible';

export interface ProcessingFailureRepository {
  list(workspaceId: string, limit: number, notBefore: Date): Promise<readonly ProcessingFailure[]>;
  requestRetry(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly kind: ProcessingKind;
    readonly messageId: string;
    readonly notBefore: Date;
  }): Promise<ProcessingRetryResult>;
}
