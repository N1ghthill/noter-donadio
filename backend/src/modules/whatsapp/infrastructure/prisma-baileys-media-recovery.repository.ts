import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { EncryptedProviderReference } from '../../media/domain/media-storage.js';
import type {
  BaileysMediaRecoveryRecord,
  BaileysMediaRecoveryRepository,
} from './baileys-media-recovery.js';

export class PrismaBaileysMediaRecoveryRepository implements BaileysMediaRecoveryRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async find(input: {
    workspaceId: string;
    accountId: string;
    messageId: string;
  }): Promise<BaileysMediaRecoveryRecord | null> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        message: { whatsappAccountId: input.accountId },
      },
      select: {
        id: true,
        encryptedProviderReference: true,
        providerReferenceIv: true,
        providerReferenceAuthTag: true,
        providerReferenceKeyVersion: true,
        message: {
          select: {
            workspaceId: true,
            whatsappAccountId: true,
            externalMessageId: true,
            direction: true,
            messageType: true,
            contact: { select: { jid: true } },
          },
        },
      },
    });
    if (
      !asset
      || !asset.encryptedProviderReference
      || !asset.providerReferenceIv
      || !asset.providerReferenceAuthTag
      || asset.providerReferenceKeyVersion === null
      || !asset.message.contact.jid
      || !['audio', 'image', 'document'].includes(asset.message.messageType)
    ) return null;
    return {
      assetId: asset.id,
      workspaceId: asset.message.workspaceId,
      accountId: asset.message.whatsappAccountId,
      externalMessageId: asset.message.externalMessageId,
      remoteJid: asset.message.contact.jid,
      fromMe: asset.message.direction === 'outbound',
      messageType: asset.message.messageType as 'audio' | 'image' | 'document',
      encryptedReference: {
        encryptedData: asset.encryptedProviderReference,
        iv: asset.providerReferenceIv,
        authTag: asset.providerReferenceAuthTag,
        encryptionKeyVersion: asset.providerReferenceKeyVersion,
      },
    };
  }

  public async update(
    assetId: string,
    encryptedReference: EncryptedProviderReference,
  ): Promise<boolean> {
    const updated = await this.prisma.mediaAsset.updateMany({
      where: { id: assetId, removedAt: null },
      data: {
        encryptedProviderReference: Buffer.from(encryptedReference.encryptedData),
        providerReferenceIv: Buffer.from(encryptedReference.iv),
        providerReferenceAuthTag: Buffer.from(encryptedReference.authTag),
        providerReferenceKeyVersion: encryptedReference.encryptionKeyVersion,
      },
    });
    return updated.count === 1;
  }
}
