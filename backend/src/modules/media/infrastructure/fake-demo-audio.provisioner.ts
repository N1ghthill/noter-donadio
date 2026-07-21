import type { DemoAudioProvisioner, MediaStorage } from '../domain/media-storage.js';

const SAMPLE_RATE = 8_000;
const DURATION_SECONDS = 1;

export class FakeDemoAudioProvisioner implements DemoAudioProvisioner {
  public constructor(
    private readonly storage: MediaStorage,
    private readonly retentionDays: number,
  ) {}

  public async provision(workspaceId: string, clientMessageId: string, now: Date) {
    const bytes = silentWav();
    const storageKey = `${workspaceId}/${clientMessageId}.wav`;
    await this.storage.write(storageKey, bytes);
    return {
      storageKey,
      fileSizeBytes: bytes.byteLength,
      durationSeconds: DURATION_SECONDS,
      mimeType: 'audio/wav',
      retentionUntil: new Date(now.getTime() + this.retentionDays * 24 * 60 * 60 * 1_000),
    };
  }
}

function silentWav(): Buffer {
  const dataLength = SAMPLE_RATE * DURATION_SECONDS * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}
