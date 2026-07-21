import type { PersistMessageCommand } from '../domain/message-ingestion.js';
import type {
  MessageIngestionRepository,
  MessageIngestionResult,
} from '../domain/message-ingestion.js';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';

const CLOSED_STAGES = ['closed_won', 'closed_lost'] as const;
const MAX_TRANSACTION_ATTEMPTS = 3;

export class PrismaMessageIngestionRepository implements MessageIngestionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async persist(command: PersistMessageCommand): Promise<MessageIngestionResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.persistOnce(command);
      } catch (error: unknown) {
        if (attempt === MAX_TRANSACTION_ATTEMPTS || !isRetryableTransactionError(error)) {
          throw error;
        }
      }
    }

    throw new Error('Limite de tentativas transacionais atingido');
  }

  private async persistOnce(command: PersistMessageCommand): Promise<MessageIngestionResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const existingMessage = await transaction.message.findUnique({
          where: {
            whatsappAccountId_externalMessageId: {
              whatsappAccountId: command.whatsappAccountId,
              externalMessageId: command.externalMessageId,
            },
          },
          select: {
            id: true,
            workspaceId: true,
            contactId: true,
            negotiationId: true,
          },
        });

        if (existingMessage !== null) {
          if (existingMessage.workspaceId !== command.workspaceId) {
            throw new Error('Conta e workspace não correspondem');
          }

          if (existingMessage.negotiationId === null) {
            throw new Error('Mensagem de negócio persistida sem negociação associada');
          }

          return {
            messageId: existingMessage.id,
            contactId: existingMessage.contactId,
            negotiationId: existingMessage.negotiationId,
            duplicate: true,
          };
        }

        const contact = await transaction.contact.upsert({
          where: {
            workspaceId_jid: {
              workspaceId: command.workspaceId,
              jid: command.remoteJid,
            },
          },
          create: {
            workspaceId: command.workspaceId,
            jid: command.remoteJid,
            phoneNumber: command.phoneNumber,
            displayName: command.displayName ?? `Novo Contato ${command.phoneNumber.slice(-4)}`,
            source: 'whatsapp_auto',
            lastInteractionAt: command.occurredAt,
          },
          update: {},
          select: {
            id: true,
            displayName: true,
          },
        });

        await transaction.$executeRaw`
          UPDATE contacts
          SET last_interaction_at = GREATEST(
            COALESCE(last_interaction_at, ${command.occurredAt}),
            ${command.occurredAt}
          )
          WHERE id = ${contact.id}::uuid
        `;

        let negotiation = await transaction.negotiation.findFirst({
          where: {
            workspaceId: command.workspaceId,
            contactId: contact.id,
            stage: { notIn: [...CLOSED_STAGES] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        negotiation ??= await transaction.negotiation.create({
          data: {
            workspaceId: command.workspaceId,
            contactId: contact.id,
            title: contact.displayName,
            stage: 'lead',
          },
          select: { id: true },
        });

        const message = await transaction.message.create({
          data: {
            workspaceId: command.workspaceId,
            whatsappAccountId: command.whatsappAccountId,
            externalMessageId: command.externalMessageId,
            contactId: contact.id,
            negotiationId: negotiation.id,
            direction: command.direction,
            messageType: command.messageType,
            content: command.content ?? null,
            contentHash: command.contentHash ?? null,
            occurredAt: command.occurredAt,
            metadata: (command.metadata ?? {}) as Prisma.InputJsonObject,
          },
          select: { id: true },
        });

        if (command.messageType === 'audio') {
          await transaction.mediaAsset.create({
            data: {
              workspaceId: command.workspaceId,
              messageId: message.id,
              transcriptionState: 'pending',
              storageKey: command.media?.storageKey ?? null,
              fileSizeBytes: command.media ? BigInt(command.media.fileSizeBytes) : null,
              durationSeconds: command.media?.durationSeconds ?? null,
              mimeType: command.media?.mimeType ?? null,
              retentionUntil: command.media?.retentionUntil ?? null,
            },
          });
        }

        await transaction.outboxEvent.createMany({
          data: [
            {
              workspaceId: command.workspaceId,
              aggregateType: 'message',
              aggregateId: message.id,
              eventType:
                command.messageType === 'audio' ? 'message.audio.ingested' : 'message.text.ingested',
              payload: {
                messageId: message.id,
                workspaceId: command.workspaceId,
                negotiationId: negotiation.id,
              },
            },
            {
              workspaceId: command.workspaceId,
              aggregateType: 'message',
              aggregateId: message.id,
              eventType: 'message.persisted',
              payload: {
                messageId: message.id,
                workspaceId: command.workspaceId,
                contactId: contact.id,
                negotiationId: negotiation.id,
              },
            },
          ],
        });

        return {
          messageId: message.id,
          contactId: contact.id,
          negotiationId: negotiation.id,
          duplicate: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = String(error.code);
  return code === 'P2002' || code === 'P2034' || code === '40001';
}
