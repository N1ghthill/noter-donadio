import { createHash } from 'node:crypto';

import type { MessageDirection, MessageType } from '@noter/contracts';

import { normalizePhoneNumber } from '../../../shared/domain/phone.js';

export type IngestibleMessageType = Extract<MessageType, 'text' | 'audio'>;

export interface IngestMessageCommand {
  readonly workspaceId: string;
  readonly whatsappAccountId: string;
  readonly externalMessageId: string;
  readonly remoteJid: string;
  readonly phoneNumber: string;
  readonly displayName?: string | undefined;
  readonly direction: MessageDirection;
  readonly messageType: IngestibleMessageType;
  readonly content?: string | undefined;
  readonly occurredAt: Date;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PersistMessageCommand extends IngestMessageCommand {
  readonly contentHash?: string | undefined;
}

export interface MessageIngestionResult {
  readonly messageId: string;
  readonly contactId: string;
  readonly negotiationId: string;
  readonly duplicate: boolean;
}

export interface MessageIngestionRepository {
  persist(command: PersistMessageCommand): Promise<MessageIngestionResult>;
}

export class MessageIngestionService {
  public constructor(private readonly repository: MessageIngestionRepository) {}

  public async execute(command: IngestMessageCommand): Promise<MessageIngestionResult> {
    if (!isDirectChatJid(command.remoteJid)) {
      throw new UnsupportedChatError();
    }

    const phoneNumber = normalizePhoneNumber(command.phoneNumber);

    return this.repository.persist({
      ...command,
      phoneNumber,
      contentHash: command.content === undefined ? undefined : hashContent(command.content),
    });
  }
}

export class UnsupportedChatError extends Error {
  public constructor() {
    super('Tipo de conversa não suportado pelo MVP');
    this.name = 'UnsupportedChatError';
  }
}

export function isDirectChatJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
