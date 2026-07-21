import type { MediaStorage } from './media-storage.js';

export interface ExpiredMedia {
  readonly id: string;
  readonly workspaceId: string;
  readonly storageKey: string;
}

export interface MediaRetentionRepository {
  listExpired(now: Date, limit: number): Promise<readonly ExpiredMedia[]>;
  markRemoved(media: ExpiredMedia, removedAt: Date): Promise<boolean>;
}

export interface MediaRetentionResult {
  readonly selected: number;
  readonly removed: number;
}

export class MediaRetentionService {
  public constructor(
    private readonly repository: MediaRetentionRepository,
    private readonly storage: MediaStorage,
  ) {}

  public async runBatch(now = new Date(), limit = 100): Promise<MediaRetentionResult> {
    const expired = await this.repository.listExpired(now, limit);
    let removed = 0;
    for (const media of expired) {
      await this.storage.delete(media.storageKey);
      if (await this.repository.markRemoved(media, now)) removed += 1;
    }
    return { selected: expired.length, removed };
  }
}
