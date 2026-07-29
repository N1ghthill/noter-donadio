import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { ContactFileRepository } from '../domain/contact-file.repository.js';

export class PrismaContactFileRepository implements ContactFileRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(input: {
    workspaceId: string;
    contactId?: string | undefined;
    search?: string | undefined;
    limit: number;
    now: Date;
  }) {
    const media = await this.prisma.mediaAsset.findMany({
      where: {
        workspaceId: input.workspaceId,
        storageKey: { not: null },
        removedAt: null,
        OR: [{ retentionUntil: null }, { retentionUntil: { gt: input.now } }],
        message: {
          ...(input.contactId ? { contactId: input.contactId } : {}),
          ...(input.search ? {
            contact: { displayName: { contains: input.search, mode: 'insensitive' } },
          } : {}),
        },
      },
      select: {
        messageId: true,
        mimeType: true,
        fileSizeBytes: true,
        durationSeconds: true,
        transcriptionState: true,
        message: {
          select: {
            contactId: true,
            negotiationId: true,
            occurredAt: true,
            contact: { select: { displayName: true } },
          },
        },
      },
      orderBy: { message: { occurredAt: 'desc' } },
      take: input.limit,
    });

    return media.map((item) => ({
      messageId: item.messageId,
      contactId: item.message.contactId,
      contactName: item.message.contact.displayName,
      negotiationId: item.message.negotiationId,
      fileName: fileName(item.message.occurredAt, item.mimeType),
      mimeType: safeMimeType(item.mimeType),
      fileSizeBytes: item.fileSizeBytes?.toString() ?? null,
      durationSeconds: item.durationSeconds,
      transcriptionState: item.transcriptionState,
      occurredAt: item.message.occurredAt.toISOString(),
    }));
  }
}

function fileName(occurredAt: Date, mimeType: string | null): string {
  const date = occurredAt.toISOString().replaceAll(':', '-');
  return `audio-${date}.${extension(mimeType)}`;
}

function extension(mimeType: string | null): string {
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/mp4') return 'm4a';
  return 'ogg';
}

function safeMimeType(value: string | null): string {
  return value && ['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp4'].includes(value)
    ? value
    : 'application/octet-stream';
}
