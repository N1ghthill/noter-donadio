import { createHmac, timingSafeEqual } from 'node:crypto';

import type { MediaStorage } from './media-storage.js';

const ACCESS_DURATION_SECONDS = 120;

export interface AccessibleMedia {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly durationSeconds: number | null;
}

export interface MediaAccessRepository {
  findAccessible(workspaceId: string, messageId: string, now: Date): Promise<AccessibleMedia | null>;
}

export class MediaAccessService {
  public constructor(
    private readonly repository: MediaAccessRepository,
    private readonly storage: MediaStorage,
    private readonly signingSecret: string,
  ) {}

  public async createAccess(workspaceId: string, messageId: string, now = new Date()) {
    const media = await this.repository.findAccessible(workspaceId, messageId, now);
    if (!media) throw new MediaNotFoundError();
    const expires = Math.floor(now.getTime() / 1_000) + ACCESS_DURATION_SECONDS;
    const signature = this.sign(workspaceId, messageId, expires);
    return {
      url: `/api/media/${messageId}/content?expires=${expires}&signature=${signature}`,
      expiresAt: new Date(expires * 1_000).toISOString(),
      mimeType: media.mimeType,
      durationSeconds: media.durationSeconds,
    };
  }

  public async read(
    workspaceId: string,
    messageId: string,
    expires: number,
    signature: string,
    now = new Date(),
  ) {
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    if (expires < nowSeconds || expires > nowSeconds + ACCESS_DURATION_SECONDS + 5) {
      throw new InvalidMediaSignatureError();
    }
    const expected = this.sign(workspaceId, messageId, expires);
    const suppliedBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      throw new InvalidMediaSignatureError();
    }
    const media = await this.repository.findAccessible(workspaceId, messageId, now);
    if (!media) throw new MediaNotFoundError();
    try {
      return { bytes: await this.storage.read(media.storageKey), mimeType: media.mimeType };
    } catch (error: unknown) {
      if (isMissingFileError(error)) throw new MediaNotFoundError();
      throw error;
    }
  }

  private sign(workspaceId: string, messageId: string, expires: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${workspaceId}:${messageId}:${expires}`, 'utf8')
      .digest('base64url');
  }
}

export class MediaNotFoundError extends Error {}
export class InvalidMediaSignatureError extends Error {}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
