import type { MessageDirection, ProcessingState } from '@noter/contracts';

export interface ContactFileView {
  readonly messageId: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly negotiationId: string | null;
  readonly messageType: 'audio' | 'image' | 'document';
  readonly direction: MessageDirection;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: string | null;
  readonly durationSeconds: number | null;
  readonly transcriptionState: ProcessingState;
  readonly retentionUntil: string | null;
  readonly caption: string | null;
  readonly occurredAt: string;
}

export interface ContactFileRepository {
  list(input: {
    readonly workspaceId: string;
    readonly contactId?: string | undefined;
    readonly search?: string | undefined;
    readonly fileType?: 'audio' | 'image' | 'document' | undefined;
    readonly direction?: MessageDirection | undefined;
    readonly occurredFrom?: Date | undefined;
    readonly occurredTo?: Date | undefined;
    readonly limit: number;
    readonly offset: number;
    readonly now: Date;
  }): Promise<readonly ContactFileView[]>;
}
