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

type DownloadMedia = (
  reference: BaileysMediaReference,
  mediaType: 'audio' | 'image' | 'document',
  signal: AbortSignal,
) => Promise<AsyncIterable<Uint8Array>> | AsyncIterable<Uint8Array>;

type RecoverMedia = (input: {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly messageId: string;
}) => Promise<void>;

interface LoadedBaileysMediaAsset {
  readonly encryptedProviderReference: Uint8Array;
  readonly providerReferenceIv: Uint8Array;
  readonly providerReferenceAuthTag: Uint8Array;
  readonly providerReferenceKeyVersion: number;
  readonly mimeType: string | null;
  readonly durationSeconds: number | null;
  readonly message: {
    readonly externalMessageId: string;
    readonly whatsappAccountId: string;
  };
}

export class BaileysMediaDownloader implements MediaDownloader {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly referenceCipher: BaileysMediaReferenceCipher,
    private readonly maxBytes: number,
    private readonly downloadMedia: DownloadMedia = defaultDownloadMedia,
    private readonly recoverMedia?: RecoverMedia,
  ) {}

  public async download(target: MediaDownloadTarget): Promise<DownloadedMedia> {
    const asset = await this.findAsset(target);
    const reference = this.decryptReference(asset, target.workspaceId);
    try {
      return await this.downloadReference(reference, asset, target.messageType);
    } catch (error: unknown) {
      if (!this.recoverMedia || !isExpiredMediaError(error)) throw error;
      await this.recoverMedia({
        workspaceId: target.workspaceId,
        accountId: asset.message.whatsappAccountId,
        messageId: target.messageId,
      });
      const recoveredAsset = await this.findAsset(target);
      return this.downloadReference(
        this.decryptReference(recoveredAsset, target.workspaceId),
        recoveredAsset,
        target.messageType,
      );
    }
  }

  private async findAsset(target: MediaDownloadTarget): Promise<LoadedBaileysMediaAsset> {
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
    return {
      encryptedProviderReference: asset.encryptedProviderReference,
      providerReferenceIv: asset.providerReferenceIv,
      providerReferenceAuthTag: asset.providerReferenceAuthTag,
      providerReferenceKeyVersion: asset.providerReferenceKeyVersion,
      mimeType: asset.mimeType,
      durationSeconds: asset.durationSeconds,
      message: asset.message,
    };
  }

  private decryptReference(
    asset: LoadedBaileysMediaAsset,
    workspaceId: string,
  ): BaileysMediaReference {
    const encryptedReference: EncryptedProviderReference = {
      encryptedData: asset.encryptedProviderReference,
      iv: asset.providerReferenceIv,
      authTag: asset.providerReferenceAuthTag,
      encryptionKeyVersion: asset.providerReferenceKeyVersion,
    };
    return this.referenceCipher.decrypt(encryptedReference, {
      workspaceId,
      accountId: asset.message.whatsappAccountId,
      externalMessageId: asset.message.externalMessageId,
    });
  }

  private async downloadReference(
    reference: BaileysMediaReference,
    asset: LoadedBaileysMediaAsset,
    messageType: MediaDownloadTarget['messageType'],
  ): Promise<DownloadedMedia> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const stream = await this.downloadMedia(reference, messageType, controller.signal);
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
        mimeType: normalizedMimeType(asset.mimeType, messageType),
        durationSeconds: asset.durationSeconds,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isExpiredMediaError(error: unknown): boolean {
  const statusCode = errorStatusCode(error);
  return statusCode === 403 || statusCode === 404 || statusCode === 410;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('output' in error && typeof error.output === 'object' && error.output !== null
    && 'statusCode' in error.output) {
    return Number(error.output.statusCode);
  }
  if ('statusCode' in error) return Number(error.statusCode);
  return undefined;
}

async function defaultDownloadMedia(
  reference: BaileysMediaReference,
  mediaType: 'audio' | 'image' | 'document',
  signal: AbortSignal,
): Promise<AsyncIterable<Uint8Array>> {
  return downloadContentFromMessage(reference, mediaType, {
    options: { signal },
  });
}

function normalizedMimeType(
  value: string | null,
  messageType: 'audio' | 'image' | 'document',
): string {
  const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (mimeType) return mimeType;
  if (messageType === 'audio') return 'audio/ogg';
  if (messageType === 'image') return 'image/jpeg';
  return 'application/octet-stream';
}
