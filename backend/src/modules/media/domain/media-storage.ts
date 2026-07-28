export interface StoredMediaDescriptor {
  readonly storageKey: string;
  readonly fileSizeBytes: number;
  readonly durationSeconds: number;
  readonly mimeType: string;
  readonly retentionUntil: Date;
}

export interface PendingMediaReference {
  readonly externalMediaId: string;
  readonly mimeType?: string | undefined;
}

export interface MediaStorage {
  write(storageKey: string, bytes: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export interface DemoAudioProvisioner {
  provision(workspaceId: string, clientMessageId: string, now: Date): Promise<StoredMediaDescriptor>;
}
