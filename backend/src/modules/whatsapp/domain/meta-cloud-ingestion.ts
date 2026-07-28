export interface MetaCloudInboundMessage {
  readonly provider: 'meta_cloud_api';
  readonly businessAccountId: string;
  readonly phoneNumberId: string;
  readonly externalMessageId: string;
  readonly remoteJid: `${string}@s.whatsapp.net`;
  readonly phoneNumber: string;
  readonly displayName?: string | undefined;
  readonly direction: 'inbound';
  readonly messageType: 'text' | 'audio';
  readonly content?: string | undefined;
  readonly occurredAt: Date;
  readonly providerMediaId?: string | undefined;
  readonly mediaMimeType?: string | undefined;
}

export interface MetaCloudAccountMapping {
  readonly workspaceId: string;
  readonly whatsappAccountId: string;
}

export interface MetaCloudAccountMappingRepository {
  resolve(
    businessAccountId: string,
    phoneNumberId: string,
  ): Promise<MetaCloudAccountMapping | null>;
}

export interface MetaCloudMessageSink {
  ingest(command: {
    readonly workspaceId: string;
    readonly whatsappAccountId: string;
    readonly externalMessageId: string;
    readonly remoteJid: string;
    readonly phoneNumber: string;
    readonly displayName?: string | undefined;
    readonly direction: 'inbound';
    readonly messageType: 'text' | 'audio';
    readonly content?: string | undefined;
    readonly occurredAt: Date;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly pendingMedia?: {
      readonly externalMediaId: string;
      readonly mimeType?: string | undefined;
    } | undefined;
  }): Promise<{ readonly duplicate: boolean }>;
}

export interface MetaCloudIngestionResult {
  readonly received: number;
  readonly duplicates: number;
}

export class MetaCloudAccountNotMappedError extends Error {
  public constructor() {
    super('Conta Meta não mapeada');
    this.name = 'MetaCloudAccountNotMappedError';
  }
}

export class MetaCloudAudioNotReadyError extends Error {
  public constructor() {
    super('Ingestão de áudio Meta ainda não está disponível');
    this.name = 'MetaCloudAudioNotReadyError';
  }
}

export class InvalidMetaCloudMessageError extends Error {
  public constructor() {
    super('Mensagem Meta inválida para ingestão');
    this.name = 'InvalidMetaCloudMessageError';
  }
}

export class MetaCloudIngestionService {
  public constructor(
    private readonly accounts: MetaCloudAccountMappingRepository,
    private readonly messages: MetaCloudMessageSink,
    private readonly audioEnabled = false,
  ) {}

  public async execute(
    inboundMessages: readonly MetaCloudInboundMessage[],
  ): Promise<MetaCloudIngestionResult> {
    if (
      !this.audioEnabled
      && inboundMessages.some((message) => message.messageType === 'audio')
    ) {
      throw new MetaCloudAudioNotReadyError();
    }

    const mappings = new Map<string, MetaCloudAccountMapping>();
    for (const message of inboundMessages) {
      const key = mappingKey(message.businessAccountId, message.phoneNumberId);
      if (mappings.has(key)) continue;

      const mapping = await this.accounts.resolve(
        message.businessAccountId,
        message.phoneNumberId,
      );
      if (!mapping) throw new MetaCloudAccountNotMappedError();
      mappings.set(key, mapping);
    }

    let duplicates = 0;
    for (const message of inboundMessages) {
      if (
        (message.messageType === 'text'
          && (message.content === undefined || message.content.length === 0))
        || (message.messageType === 'audio' && !message.providerMediaId)
      ) {
        throw new InvalidMetaCloudMessageError();
      }
      const mapping = mappings.get(mappingKey(message.businessAccountId, message.phoneNumberId));
      if (!mapping) throw new MetaCloudAccountNotMappedError();

      const result = await this.messages.ingest({
        ...mapping,
        externalMessageId: message.externalMessageId,
        remoteJid: message.remoteJid,
        phoneNumber: message.phoneNumber,
        ...(message.displayName ? { displayName: message.displayName } : {}),
        direction: 'inbound',
        messageType: message.messageType,
        ...(message.content ? { content: message.content } : {}),
        occurredAt: message.occurredAt,
        metadata: {
          source: 'meta_cloud_api',
          businessAccountId: message.businessAccountId,
          phoneNumberId: message.phoneNumberId,
        },
        ...(message.messageType === 'audio' && message.providerMediaId
          ? {
              pendingMedia: {
                externalMediaId: message.providerMediaId,
                ...(message.mediaMimeType ? { mimeType: message.mediaMimeType } : {}),
              },
            }
          : {}),
      });
      if (result.duplicate) duplicates += 1;
    }

    return { received: inboundMessages.length, duplicates };
  }
}

function mappingKey(businessAccountId: string, phoneNumberId: string): string {
  return `${businessAccountId}\u0000${phoneNumberId}`;
}
