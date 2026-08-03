import type { NegotiationStage, ProcessingState } from '@noter/contracts';

import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ConversationListFilters,
  ConversationRepository,
  ConversationSummaryView,
} from '../domain/conversation.repository.js';

export class PrismaConversationRepository implements ConversationRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(
    workspaceId: string,
    filters: ConversationListFilters,
  ): Promise<ConversationSummaryView[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`ranked.row_number = 1`];
    if (filters.startedFrom) {
      conditions.push(Prisma.sql`ranked.first_message_at >= ${filters.startedFrom}`);
    }
    if (filters.startedTo) {
      conditions.push(Prisma.sql`ranked.first_message_at < ${filters.startedTo}`);
    }
    if (filters.stage) conditions.push(Prisma.sql`ranked.stage = ${filters.stage}::"NegotiationStage"`);
    if (filters.aiStage) {
      conditions.push(Prisma.sql`analysis.suggested_stage = ${filters.aiStage}::"NegotiationStage"`);
    }
    if (filters.search) {
      const search = `%${filters.search}%`;
      conditions.push(Prisma.sql`(
        ranked.display_name ILIKE ${search}
        OR COALESCE(ranked.title, '') ILIKE ${search}
      )`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const messages = await this.prisma.$queryRaw<ConversationRow[]>`
      WITH ranked AS (
        SELECT
               message.negotiation_id,
               message.contact_id,
               contact.phone_number,
               contact.display_name,
               negotiation.title,
               negotiation.stage,
               message.id,
               message.direction,
               message.message_type,
               message.content,
               message.occurred_at,
               MIN(message.occurred_at) OVER (
                 PARTITION BY contact.phone_number
               ) AS first_message_at,
               COUNT(*) OVER (
                 PARTITION BY contact.phone_number
               )::integer AS message_count,
               ROW_NUMBER() OVER (
                 PARTITION BY contact.phone_number
                 ORDER BY message.occurred_at DESC, message.id DESC
               ) AS row_number
        FROM messages AS message
        INNER JOIN contacts AS contact
          ON contact.workspace_id = message.workspace_id AND contact.id = message.contact_id
        INNER JOIN negotiations AS negotiation
          ON negotiation.workspace_id = message.workspace_id AND negotiation.id = message.negotiation_id
        WHERE message.workspace_id = ${workspaceId}::uuid
          ${filters.contactId ? Prisma.sql`
            AND contact.phone_number = (
              SELECT selected.phone_number
              FROM contacts AS selected
              WHERE selected.workspace_id = ${workspaceId}::uuid
                AND selected.id = ${filters.contactId}::uuid
            )
          ` : Prisma.empty}
          AND message.negotiation_id IS NOT NULL
      )
      SELECT ranked.negotiation_id AS "negotiationId",
             ranked.contact_id AS "contactId",
             ranked.display_name AS "contactName",
             ranked.title,
             ranked.stage::text AS stage,
             ranked.first_message_at AS "firstMessageAt",
             ranked.message_count AS "messageCount",
             ranked.id AS "messageId",
             ranked.direction::text AS direction,
             ranked.message_type::text AS "messageType",
             ranked.content,
             ranked.occurred_at AS "occurredAt",
             analysis.id AS "analysisId",
             analysis.state::text AS "analysisState",
             analysis.summary AS "analysisSummary",
             analysis.sentiment::text AS "analysisSentiment",
             analysis.suggested_stage::text AS "analysisSuggestedStage",
             analysis.suggested_tags AS "analysisSuggestedTags",
             analysis.conversation_context->>'interactionType' AS "analysisInteractionType",
             CASE
               WHEN analysis.conversation_context->>'needsHumanReview' IN ('true', 'false')
                 THEN (analysis.conversation_context->>'needsHumanReview')::boolean
               ELSE false
             END AS "analysisNeedsHumanReview",
             analysis.created_at AS "analysisCreatedAt"
      FROM ranked
      LEFT JOIN LATERAL (
        SELECT ai.id, ai.state, ai.summary, ai.sentiment, ai.suggested_stage,
               ai.suggested_tags, ai.conversation_context, ai.created_at
        FROM ai_analyses AS ai
        WHERE ai.workspace_id = ${workspaceId}::uuid
          AND ai.negotiation_id = ranked.negotiation_id
          AND ai.state = 'completed'::"ProcessingState"
        ORDER BY ai.created_at DESC, ai.id DESC
        LIMIT 1
      ) AS analysis ON true
      WHERE ${where}
      ORDER BY ranked.occurred_at DESC, ranked.id DESC
      LIMIT ${filters.limit}
      OFFSET ${filters.offset}
    `;

    return messages.map((message) => ({
      negotiationId: message.negotiationId,
      contactId: message.contactId,
      contactName: message.contactName,
      stage: message.stage,
      title: message.title,
      firstMessageAt: message.firstMessageAt.toISOString(),
      messageCount: message.messageCount,
      latestAnalysis: message.analysisId && message.analysisState && message.analysisCreatedAt ? {
        state: message.analysisState,
        summary: message.analysisSummary,
        sentiment: message.analysisSentiment,
        suggestedStage: message.analysisSuggestedStage,
        suggestedTags: message.analysisSuggestedTags ?? [],
        interactionType: interactionType(message.analysisInteractionType),
        needsHumanReview: message.analysisNeedsHumanReview ?? false,
        createdAt: message.analysisCreatedAt.toISOString(),
      } : null,
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
  readonly title: string | null;
  readonly stage: NegotiationStage;
  readonly firstMessageAt: Date;
  readonly messageCount: number;
  readonly messageId: string;
  readonly direction: 'inbound' | 'outbound';
  readonly messageType: string;
  readonly content: string | null;
  readonly occurredAt: Date;
  readonly analysisId: string | null;
  readonly analysisState: ProcessingState | null;
  readonly analysisSummary: string | null;
  readonly analysisSentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
  readonly analysisSuggestedStage: NegotiationStage | null;
  readonly analysisSuggestedTags: string[] | null;
  readonly analysisInteractionType: string | null;
  readonly analysisNeedsHumanReview: boolean | null;
  readonly analysisCreatedAt: Date | null;
}

function interactionType(
  value: string | null,
): NonNullable<ConversationSummaryView['latestAnalysis']>['interactionType'] {
  switch (value) {
    case 'new_lead':
    case 'new_case':
    case 'continuation':
    case 'follow_up_response':
    case 'multiple_cases':
    case 'unclear':
      return value;
    default:
      return null;
  }
}
