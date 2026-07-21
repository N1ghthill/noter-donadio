import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { MediaAccessRepository } from '../domain/media-access.js';

export class PrismaMediaAccessRepository implements MediaAccessRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findAccessible(workspaceId: string, messageId: string, now: Date) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        workspaceId,
        messageId,
        storageKey: { not: null },
        removedAt: null,
        OR: [{ retentionUntil: null }, { retentionUntil: { gt: now } }],
      },
      select: { storageKey: true, mimeType: true, durationSeconds: true },
    });
    if (!media?.storageKey) return null;
    return {
      storageKey: media.storageKey,
      mimeType: safeAudioMimeType(media.mimeType),
      durationSeconds: media.durationSeconds,
    };
  }
}

function safeAudioMimeType(value: string | null): string {
  return value && ['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4'].includes(value)
    ? value
    : 'application/octet-stream';
}
