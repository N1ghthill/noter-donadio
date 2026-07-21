import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ExpiredMedia,
  MediaRetentionRepository,
} from '../domain/media-retention.js';

export class PrismaMediaRetentionRepository implements MediaRetentionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listExpired(now: Date, limit: number): Promise<readonly ExpiredMedia[]> {
    const records = await this.prisma.mediaAsset.findMany({
      where: {
        retentionUntil: { lte: now },
        removedAt: null,
        storageKey: { not: null },
      },
      select: { id: true, workspaceId: true, storageKey: true },
      orderBy: { retentionUntil: 'asc' },
      take: limit,
    });
    return records.flatMap((record) => record.storageKey ? [{ ...record, storageKey: record.storageKey }] : []);
  }

  public async markRemoved(media: ExpiredMedia, removedAt: Date): Promise<boolean> {
    const result = await this.prisma.mediaAsset.updateMany({
      where: {
        id: media.id,
        workspaceId: media.workspaceId,
        storageKey: media.storageKey,
        removedAt: null,
      },
      data: {
        storageKey: null,
        fileSizeBytes: null,
        removedAt,
      },
    });
    return result.count === 1;
  }
}
