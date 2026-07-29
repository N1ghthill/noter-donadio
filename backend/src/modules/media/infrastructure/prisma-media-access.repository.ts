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
      select: {
        storageKey: true,
        mimeType: true,
        durationSeconds: true,
        originalFileName: true,
        message: { select: { messageType: true, occurredAt: true } },
      },
    });
    if (!media?.storageKey) return null;
    return {
      storageKey: media.storageKey,
      mimeType: safeMediaMimeType(media.mimeType, media.message.messageType),
      durationSeconds: media.durationSeconds,
      fileName: safeFileName(media.originalFileName)
        ?? `arquivo-${media.message.occurredAt.toISOString().slice(0, 10)}`,
      disposition: media.message.messageType === 'document' ? 'attachment' as const : 'inline' as const,
    };
  }
}

function safeMediaMimeType(value: string | null, messageType: string): string {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (messageType === 'audio' && normalized?.startsWith('audio/')) return normalized;
  if (messageType === 'image' && normalized
    && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalized)) return normalized;
  if (messageType === 'document' && normalized && [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'text/plain', 'text/csv',
  ].includes(normalized)) return normalized;
  return 'application/octet-stream';
}

function safeFileName(value: string | null): string | undefined {
  if (!value) return undefined;
  const fileName = value.replaceAll('\\', '/').split('/').at(-1)
    ?.split('').filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }).join('').trim();
  return fileName ? fileName.slice(0, 255) : undefined;
}
