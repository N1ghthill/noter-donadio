import type { NegotiationStage } from '@noter/contracts';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ConversationRepository,
  ConversationSummaryView,
} from '../domain/conversation.repository.js';

export class PrismaConversationRepository implements ConversationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(workspaceId: string, limit: number): Promise<ConversationSummaryView[]> {
    const messages = await this.prisma.$queryRaw<ConversationRow[]>`
      SELECT latest.negotiation_id AS "negotiationId",
             latest.contact_id AS "contactId",
             latest.display_name AS "contactName",
             latest.stage::text AS stage,
             latest.id AS "messageId",
             latest.direction::text AS direction,
             latest.message_type::text AS "messageType",
             latest.content,
             latest.occurred_at AS "occurredAt"
      FROM (
        SELECT DISTINCT ON (message.negotiation_id)
               message.negotiation_id,
               message.contact_id,
               contact.display_name,
               negotiation.stage,
               message.id,
               message.direction,
               message.message_type,
               message.content,
               message.occurred_at
        FROM messages AS message
        INNER JOIN contacts AS contact
          ON contact.workspace_id = message.workspace_id AND contact.id = message.contact_id
        INNER JOIN negotiations AS negotiation
          ON negotiation.workspace_id = message.workspace_id AND negotiation.id = message.negotiation_id
        WHERE message.workspace_id = ${workspaceId}::uuid
          AND message.negotiation_id IS NOT NULL
        ORDER BY message.negotiation_id, message.occurred_at DESC, message.id DESC
      ) AS latest
      ORDER BY latest.occurred_at DESC, latest.id DESC
      LIMIT ${limit}
    `;

    return messages.map((message) => ({
      negotiationId: message.negotiationId,
      contactId: message.contactId,
      contactName: message.contactName,
      stage: message.stage,
      lastMessage: {
        id: message.messageId,
        direction: message.direction,
        messageType: message.messageType,
        content: message.content,
        occurredAt: message.occurredAt.toISOString(),
      },
    }));
  }
}

interface ConversationRow {
  readonly negotiationId: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly stage: NegotiationStage;
  readonly messageId: string;
  readonly direction: 'inbound' | 'outbound';
  readonly messageType: string;
  readonly content: string | null;
  readonly occurredAt: Date;
}
