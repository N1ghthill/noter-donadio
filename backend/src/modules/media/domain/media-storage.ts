export interface StoredMediaDescriptor {
  readonly storageKey: string;
  readonly fileSizeBytes: number;
  readonly durationSeconds: number;
  readonly mimeType: string;
  readonly originalFileName?: string | undefined;
  readonly retentionUntil: Date;
}

export interface PendingMediaReference {
  readonly externalMediaId: string;
  readonly mimeType?: string | undefined;
  readonly durationSeconds?: number | undefined;
  readonly originalFileName?: string | undefined;
  readonly encryptedProviderReference?: EncryptedProviderReference | undefined;
}

export interface EncryptedProviderReference {
  readonly encryptedData: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly encryptionKeyVersion: number;
}

export interface MediaStorage {
  write(storageKey: string, bytes: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export interface DemoAudioProvisioner {
  provision(workspaceId: string, clientMessageId: string, now: Date): Promise<StoredMediaDescriptor>;
}
