import { downloadContentFromMessage } from 'baileys';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DownloadedMedia,
  MediaDownloader,
  MediaDownloadTarget,
} from '../domain/media-download.js';
import type { EncryptedProviderReference } from '../domain/media-storage.js';
import type {
  BaileysMediaReference,
  BaileysMediaReferenceCipher,
} from '../../whatsapp/infrastructure/baileys-media-reference.js';

const DOWNLOAD_TIMEOUT_MS = 30_000;

type DownloadAudio = (
  reference: BaileysMediaReference,
  signal: AbortSignal,
) => Promise<AsyncIterable<Uint8Array>> | AsyncIterable<Uint8Array>;

export class BaileysMediaDownloader implements MediaDownloader {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly referenceCipher: BaileysMediaReferenceCipher,
    private readonly maxBytes: number,
    private readonly downloadAudio: DownloadAudio = defaultDownloadAudio,
  ) {}

  public async download(target: MediaDownloadTarget): Promise<DownloadedMedia> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        workspaceId: target.workspaceId,
        messageId: target.messageId,
        externalMediaId: target.externalMediaId,
      },
      select: {
        encryptedProviderReference: true,
        providerReferenceIv: true,
        providerReferenceAuthTag: true,
        providerReferenceKeyVersion: true,
        mimeType: true,
        durationSeconds: true,
        message: {
          select: {
            externalMessageId: true,
            whatsappAccountId: true,
          },
        },
      },
    });
    if (
      !asset?.encryptedProviderReference
      || !asset.providerReferenceIv
      || !asset.providerReferenceAuthTag
      || asset.providerReferenceKeyVersion === null
    ) throw new Error('baileys_media_reference_missing');

    const encryptedReference: EncryptedProviderReference = {
      encryptedData: asset.encryptedProviderReference,
      iv: asset.providerReferenceIv,
      authTag: asset.providerReferenceAuthTag,
      encryptionKeyVersion: asset.providerReferenceKeyVersion,
    };
    const reference = this.referenceCipher.decrypt(encryptedReference, {
      workspaceId: target.workspaceId,
      accountId: asset.message.whatsappAccountId,
      externalMessageId: asset.message.externalMessageId,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const stream = await this.downloadAudio(reference, controller.signal);
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        if (totalBytes > this.maxBytes) {
          controller.abort();
          throw new Error('baileys_media_too_large');
        }
        chunks.push(buffer);
      }
      return {
        bytes: Buffer.concat(chunks, totalBytes),
        mimeType: normalizedMimeType(asset.mimeType),
        durationSeconds: asset.durationSeconds,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function defaultDownloadAudio(
  reference: BaileysMediaReference,
  signal: AbortSignal,
): Promise<AsyncIterable<Uint8Array>> {
  return downloadContentFromMessage(reference, 'audio', {
    options: { signal },
  });
}

function normalizedMimeType(value: string | null): string {
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mimeType?.startsWith('audio/') ? mimeType : 'audio/ogg';
}
