import { randomUUID } from 'node:crypto';

import type { MediaStorage } from './media-storage.js';

const LEASE_DURATION_MS = 5 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface MediaDownloadTarget {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly attemptId: string;
  readonly externalMediaId: string;
  readonly expectedMimeType: string | null;
  readonly provider: string | null;
  readonly providerPhoneNumberId: string | null;
}

export interface DownloadedMedia {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly durationSeconds: number | null;
}

export type MediaDownloadClaim =
  | { readonly status: 'claimed'; readonly target: MediaDownloadTarget }
  | { readonly status: 'completed' | 'busy' | 'missing' };

export interface MediaDownloadRepository {
  claim(input: {
    readonly workspaceId: string;
    readonly messageId: string;
    readonly attemptId: string;
    readonly now: Date;
    readonly staleBefore: Date;
  }): Promise<MediaDownloadClaim>;
  complete(input: MediaDownloadTarget & {
    readonly storageKey: string;
    readonly fileSizeBytes: number;
    readonly mimeType: string;
    readonly durationSeconds: number | null;
    readonly retentionUntil: Date;
  }): Promise<boolean>;
  fail(input: MediaDownloadTarget & { readonly failureCode: string }): Promise<void>;
}

export interface MediaDownloader {
  download(target: MediaDownloadTarget): Promise<DownloadedMedia>;
}

export interface MediaDownloadExecution {
  readonly status: 'completed' | 'already_completed' | 'busy' | 'missing';
}

export class MediaDownloadService {
  public constructor(
    private readonly repository: MediaDownloadRepository,
    private readonly downloader: MediaDownloader,
    private readonly storage: MediaStorage,
    private readonly retentionDays: number,
  ) {}

  public async execute(
    workspaceId: string,
    messageId: string,
    now = new Date(),
  ): Promise<MediaDownloadExecution> {
    const claim = await this.repository.claim({
      workspaceId,
      messageId,
      attemptId: randomUUID(),
      now,
      staleBefore: new Date(now.getTime() - LEASE_DURATION_MS),
    });
    if (claim.status !== 'claimed') {
      return { status: claim.status === 'completed' ? 'already_completed' : claim.status };
    }

    const storageKey = `${workspaceId}/${claim.target.attemptId}.media`;
    try {
      const downloaded = validateDownloadedMedia(
        await this.downloader.download(claim.target),
        claim.target.expectedMimeType,
      );
      await this.storage.write(storageKey, downloaded.bytes);
      const completed = await this.repository.complete({
        ...claim.target,
        storageKey,
        fileSizeBytes: downloaded.bytes.byteLength,
        mimeType: downloaded.mimeType,
        durationSeconds: downloaded.durationSeconds,
        retentionUntil: new Date(now.getTime() + this.retentionDays * DAY_MS),
      });
      if (!completed) await this.storage.delete(storageKey);
      return { status: completed ? 'completed' : 'busy' };
    } catch {
      await this.repository.fail({
        ...claim.target,
        failureCode: 'MEDIA_DOWNLOAD_FAILED',
      });
      throw new MediaDownloadFailedError();
    }
  }
}

export class MediaDownloadFailedError extends Error {
  public constructor() {
    super('Falha no download da mídia');
    this.name = 'MediaDownloadFailedError';
  }
}

export function validateDownloadedMedia(
  media: DownloadedMedia,
  expectedMimeType: string | null,
): DownloadedMedia {
  const mimeType = media.mimeType.trim().toLowerCase();
  if (!mimeType.startsWith('audio/') || mimeType.length > 100) {
    throw new Error('invalid_media_mime_type');
  }
  const expectedBaseMimeType = expectedMimeType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (expectedBaseMimeType && expectedBaseMimeType !== mimeType) {
    throw new Error('unexpected_media_mime_type');
  }
  if (media.bytes.byteLength === 0) throw new Error('empty_media');
  if (
    media.durationSeconds !== null
    && (!Number.isInteger(media.durationSeconds) || media.durationSeconds < 0)
  ) {
    throw new Error('invalid_media_duration');
  }
  return { ...media, mimeType };
}
