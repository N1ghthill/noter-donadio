import type { WAMessage, WASocket } from 'baileys';

import type { EncryptedProviderReference } from '../../media/domain/media-storage.js';
import type {
  BaileysMediaReference,
  BaileysMediaReferenceCipher,
} from './baileys-media-reference.js';

export interface BaileysMediaRecoveryRecord {
  readonly assetId: string;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly fromMe: boolean;
  readonly messageType: 'audio' | 'image' | 'document';
  readonly encryptedReference: EncryptedProviderReference;
}

export interface BaileysMediaRecoveryRepository {
  find(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly messageId: string;
  }): Promise<BaileysMediaRecoveryRecord | null>;
  update(assetId: string, encryptedReference: EncryptedProviderReference): Promise<boolean>;
}

export class BaileysMediaRecovery {
  public constructor(
    private readonly repository: BaileysMediaRecoveryRepository,
    private readonly referenceCipher: BaileysMediaReferenceCipher,
  ) {}

  public async execute(
    socket: Pick<WASocket, 'updateMediaMessage'>,
    input: {
      readonly workspaceId: string;
      readonly accountId: string;
      readonly messageId: string;
    },
  ): Promise<void> {
    const record = await this.repository.find(input);
    if (!record) throw new Error('baileys_media_recovery_target_missing');
    const binding = {
      workspaceId: record.workspaceId,
      accountId: record.accountId,
      externalMessageId: record.externalMessageId,
    };
    const reference = this.referenceCipher.decrypt(record.encryptedReference, binding);
    const recoveredMessage = await socket.updateMediaMessage(toMessage(record, reference));
    const refreshedReference = this.referenceCipher.fromMediaMessage(
      mediaContent(recoveredMessage, record.messageType),
    );
    if (!refreshedReference) throw new Error('baileys_media_recovery_reference_missing');
    const recoveredReference: BaileysMediaReference = {
      ...refreshedReference,
      retryRemoteJid: reference.retryRemoteJid ?? record.remoteJid,
    };
    const updated = await this.repository.update(
      record.assetId,
      this.referenceCipher.encrypt(recoveredReference, binding),
    );
    if (!updated) throw new Error('baileys_media_recovery_target_changed');
  }
}

function toMessage(
  record: BaileysMediaRecoveryRecord,
  reference: BaileysMediaReference,
): WAMessage {
  const media = {
    ...(reference.url ? { url: reference.url } : {}),
    ...(reference.directPath ? { directPath: reference.directPath } : {}),
    mediaKey: reference.mediaKey,
  };
  return {
    key: {
      remoteJid: reference.retryRemoteJid ?? record.remoteJid,
      id: record.externalMessageId,
      fromMe: record.fromMe,
    },
    message: record.messageType === 'audio'
      ? { audioMessage: media }
      : record.messageType === 'image'
        ? { imageMessage: media }
        : { documentMessage: media },
  };
}

function mediaContent(
  message: WAMessage,
  messageType: BaileysMediaRecoveryRecord['messageType'],
): {
  readonly url?: string | null;
  readonly directPath?: string | null;
  readonly mediaKey?: Uint8Array | null;
} {
  const content = message.message;
  const media = messageType === 'audio'
    ? content?.audioMessage
    : messageType === 'image'
      ? content?.imageMessage
      : content?.documentMessage;
  if (!media) throw new Error('baileys_media_recovery_content_missing');
  return media;
}
