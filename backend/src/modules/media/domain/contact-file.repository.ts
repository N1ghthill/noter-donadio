import type { ProcessingState } from '@noter/contracts';

export interface ContactFileView {
  readonly messageId: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly negotiationId: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: string | null;
  readonly durationSeconds: number | null;
  readonly transcriptionState: ProcessingState;
  readonly occurredAt: string;
}

export interface ContactFileRepository {
  list(input: {
    readonly workspaceId: string;
    readonly contactId?: string | undefined;
    readonly search?: string | undefined;
    readonly limit: number;
    readonly now: Date;
  }): Promise<readonly ContactFileView[]>;
}
