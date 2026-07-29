import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { ContactFileRepository } from '../domain/contact-file.repository.js';

export class PrismaContactFileRepository implements ContactFileRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(input: {
    workspaceId: string;
    contactId?: string | undefined;
    search?: string | undefined;
    fileType?: 'audio' | 'image' | 'document' | undefined;
    direction?: 'inbound' | 'outbound' | undefined;
    occurredFrom?: Date | undefined;
    occurredTo?: Date | undefined;
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
          ...(input.fileType ? { messageType: input.fileType } : {
            messageType: { in: ['audio', 'image', 'document'] as const },
          }),
          ...(input.direction ? { direction: input.direction } : {}),
          ...((input.occurredFrom || input.occurredTo) ? {
            occurredAt: {
              ...(input.occurredFrom ? { gte: input.occurredFrom } : {}),
              ...(input.occurredTo ? { lt: input.occurredTo } : {}),
            },
          } : {}),
          ...(input.search ? {
            OR: [
              { contact: { displayName: { contains: input.search, mode: 'insensitive' } } },
              { content: { contains: input.search, mode: 'insensitive' } },
              { mediaAsset: { originalFileName: { contains: input.search, mode: 'insensitive' } } },
            ],
          } : {}),
        },
      },
      select: {
        messageId: true,
        mimeType: true,
        fileSizeBytes: true,
        durationSeconds: true,
        originalFileName: true,
        transcriptionState: true,
        message: {
          select: {
            contactId: true,
            negotiationId: true,
            occurredAt: true,
            messageType: true,
            direction: true,
            content: true,
            contact: { select: { displayName: true } },
          },
        },
      },
      orderBy: { message: { occurredAt: 'desc' } },
      take: input.limit,
    });

    return media.flatMap((item) => {
      if (!isCatalogMediaType(item.message.messageType)) return [];
      return [{
      messageId: item.messageId,
      contactId: item.message.contactId,
      contactName: item.message.contact.displayName,
      negotiationId: item.message.negotiationId,
      messageType: item.message.messageType,
      direction: item.message.direction,
      fileName: safeFileName(item.originalFileName)
        ?? generatedFileName(item.message.messageType, item.message.occurredAt, item.mimeType),
      mimeType: safeMimeType(item.mimeType, item.message.messageType),
      fileSizeBytes: item.fileSizeBytes?.toString() ?? null,
      durationSeconds: item.durationSeconds,
      transcriptionState: item.transcriptionState,
      caption: item.message.content,
      occurredAt: item.message.occurredAt.toISOString(),
      }];
    });
  }
}

function generatedFileName(
  messageType: 'audio' | 'image' | 'document',
  occurredAt: Date,
  mimeType: string | null,
): string {
  const date = occurredAt.toISOString().replaceAll(':', '-');
  return `${messageType}-${date}.${extension(mimeType, messageType)}`;
}

function extension(mimeType: string | null, messageType: 'audio' | 'image' | 'document'): string {
  if (mimeType === 'audio/wav') return 'wav';
  if (mimeType === 'audio/mpeg') return 'mp3';
  if (mimeType === 'audio/mp4') return 'm4a';
  if (mimeType === 'audio/ogg') return 'ogg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType === 'text/csv') return 'csv';
  if (mimeType === 'application/msword') return 'doc';
  if (mimeType?.includes('wordprocessingml')) return 'docx';
  if (mimeType === 'application/vnd.ms-excel') return 'xls';
  if (mimeType?.includes('spreadsheetml')) return 'xlsx';
  if (mimeType === 'application/vnd.ms-powerpoint') return 'ppt';
  if (mimeType?.includes('presentationml')) return 'pptx';
  if (mimeType === 'application/zip') return 'zip';
  return messageType === 'audio' ? 'ogg' : messageType === 'image' ? 'jpg' : 'bin';
}

function safeMimeType(
  value: string | null,
  messageType: 'audio' | 'image' | 'document',
): string {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (messageType === 'audio' && normalized?.startsWith('audio/')) return normalized;
  if (messageType === 'image'
    && normalized
    && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalized)) return normalized;
  if (messageType === 'document' && normalized && [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'text/csv',
  ].includes(normalized)) return normalized;
  return 'application/octet-stream';
}

function isCatalogMediaType(value: string): value is 'audio' | 'image' | 'document' {
  return value === 'audio' || value === 'image' || value === 'document';
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
