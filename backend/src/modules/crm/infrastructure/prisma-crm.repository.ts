import type { NegotiationStage } from '@noter/contracts';

import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { normalizePhoneNumber } from '../../../shared/domain/phone.js';
import {
  CrmConflictError,
  CrmDecisionConflictError,
  CrmNotFoundError,
  CrmTagLimitError,
  type AnalysisDecisionView,
  type AuditEventView,
  type ContactView,
  type CrmRepository,
  type NegotiationDetailView,
  type NegotiationView,
} from '../domain/crm.repository.js';

export class PrismaCrmRepository implements CrmRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listContacts(workspaceId: string, search: string | undefined, limit: number) {
    const phoneSearch = search ? normalizeSearchPhone(search) : '';
    const contacts = await this.prisma.contact.findMany({
      where: {
        workspaceId,
        ...(search
          ? {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' as const } },
                ...(phoneSearch ? [{ phoneNumber: { contains: phoneSearch } }] : []),
              ],
            }
          : {}),
      },
      orderBy: [{ lastInteractionAt: 'desc' }, { displayName: 'asc' }],
      take: limit,
    });
    return contacts.map(toContactView);
  }

  public async createContact(input: {
    workspaceId: string;
    userId: string;
    displayName: string;
    phoneNumber: string;
    tags: readonly string[];
    notes?: string | undefined;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const contact = await transaction.contact.create({
        data: {
          workspaceId: input.workspaceId,
          displayName: input.displayName,
          phoneNumber: normalizePhoneNumber(input.phoneNumber),
          tags: [...input.tags],
          notes: input.notes ?? null,
          source: 'manual',
        },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          contactId: contact.id,
          action: 'contact_created',
          changedFields: [
            'displayName',
            'phoneNumber',
            ...(input.tags.length ? ['tags'] : []),
            ...(input.notes !== undefined ? ['notes'] : []),
          ],
        },
      });
      return toContactView(contact);
    });
  }

  public async updateContact(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
    displayName?: string | undefined;
    phoneNumber?: string | undefined;
    tags?: readonly string[] | undefined;
    notes?: string | null | undefined;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.contact.findFirst({
        where: { id: input.contactId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!current) throw new CrmNotFoundError();

      const changedFields = [
        input.displayName !== undefined ? 'displayName' : undefined,
        input.phoneNumber !== undefined ? 'phoneNumber' : undefined,
        input.tags !== undefined ? 'tags' : undefined,
        input.notes !== undefined ? 'notes' : undefined,
      ].filter((field): field is string => field !== undefined);

      const contact = await transaction.contact.update({
        where: { id: input.contactId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.phoneNumber !== undefined ? { phoneNumber: normalizePhoneNumber(input.phoneNumber) } : {}),
          ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'contact',
          aggregateId: input.contactId,
          eventType: 'contact.updated',
          payload: { contactId: input.contactId, workspaceId: input.workspaceId, changedFields },
        },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          contactId: input.contactId,
          action: 'contact_updated',
          changedFields,
        },
      });
      return toContactView(contact);
    });
  }

  public async listNegotiations(workspaceId: string, stage: NegotiationStage | undefined) {
    const negotiations = await this.prisma.negotiation.findMany({
      where: { workspaceId, ...(stage ? { stage } : {}) },
      include: { contact: { select: { displayName: true } } },
      orderBy: [{ stage: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
    return negotiations.map(toNegotiationView);
  }

  public async getNegotiation(workspaceId: string, negotiationId: string): Promise<NegotiationDetailView> {
    const negotiation = await this.prisma.negotiation.findFirst({
      where: { id: negotiationId, workspaceId },
      include: {
        contact: true,
        messages: {
          orderBy: { occurredAt: 'desc' },
          take: 100,
          include: { mediaAsset: true },
        },
        aiAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { decision: true },
        },
      },
    });
    if (!negotiation) throw new CrmNotFoundError();
    const auditTrail = await this.prisma.auditEvent.findMany({
      where: {
        workspaceId,
        OR: [{ negotiationId }, { contactId: negotiation.contactId }],
      },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      ...toNegotiationView(negotiation),
      contact: toContactView(negotiation.contact),
      messages: negotiation.messages.toReversed().map((message) => ({
        id: message.id,
        direction: message.direction,
        messageType: message.messageType,
        content: message.content,
        occurredAt: message.occurredAt.toISOString(),
        media: message.mediaAsset ? {
          transcriptionState: message.mediaAsset.transcriptionState,
          transcriptionText: message.mediaAsset.transcriptionText,
          durationSeconds: message.mediaAsset.durationSeconds,
          mimeType: message.mediaAsset.mimeType,
        } : null,
      })),
      analyses: negotiation.aiAnalyses.map((analysis) => ({
        id: analysis.id,
        state: analysis.state,
        summary: analysis.summary,
        entities: toAnalysisEntities(analysis.entities),
        sentiment: analysis.sentiment,
        objections: analysis.objections,
        nextActions: analysis.nextActions,
        suggestedTags: analysis.suggestedTags,
        suggestedStage: analysis.suggestedStage,
        confidenceScore: analysis.confidenceScore?.toString() ?? null,
        promptVersion: analysis.promptVersion,
        modelUsed: analysis.modelUsed,
        createdAt: analysis.createdAt.toISOString(),
        decision: analysis.decision ? toAnalysisDecisionView(analysis.decision) : null,
      })),
      auditTrail: auditTrail.map(toAuditEventView),
    };
  }

  public async updateNegotiationStage(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    stage: NegotiationStage;
    expectedVersion: number;
  }) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.negotiation.findFirst({
        where: { id: input.negotiationId, workspaceId: input.workspaceId },
        select: { id: true, contactId: true, stage: true, version: true },
      });
      if (!current) throw new CrmNotFoundError();

      const result = await transaction.negotiation.updateMany({
        where: {
          id: input.negotiationId,
          workspaceId: input.workspaceId,
          version: input.expectedVersion,
        },
        data: {
          stage: input.stage,
          version: { increment: 1 },
          closedAt: input.stage === 'closed_won' || input.stage === 'closed_lost' ? new Date() : null,
        },
      });
      if (result.count !== 1) throw new CrmConflictError();

      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'negotiation',
          aggregateId: input.negotiationId,
          eventType: 'negotiation.stage.changed',
          payload: {
            negotiationId: input.negotiationId,
            workspaceId: input.workspaceId,
            stage: input.stage,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          contactId: current.contactId,
          negotiationId: input.negotiationId,
          action: 'negotiation_stage_changed',
          changedFields: ['stage'],
          previousVersion: current.version,
          resultingVersion: current.version + 1,
          details: { previousStage: current.stage, resultingStage: input.stage },
        },
      });

      const updated = await transaction.negotiation.findUniqueOrThrow({
        where: { id: input.negotiationId },
        include: { contact: { select: { displayName: true } } },
      });
      return toNegotiationView(updated);
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) throw new CrmConflictError();
      throw error;
    }
  }

  public async decideAnalysis(input: {
    workspaceId: string;
    userId: string;
    negotiationId: string;
    analysisId: string;
    decisionId: string;
    decision: 'accepted' | 'ignored';
    expectedVersion: number;
    stage?: NegotiationStage | undefined;
    tags?: readonly string[] | undefined;
  }): Promise<AnalysisDecisionView> {
    const requestedTags = [...new Set(input.tags ?? [])];
    if (input.decision === 'accepted' && input.stage === undefined && requestedTags.length === 0) {
      throw new CrmDecisionConflictError();
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.analysisDecision.findFirst({
          where: { id: input.decisionId, workspaceId: input.workspaceId },
        });
        if (existing) {
          if (
            existing.analysisId !== input.analysisId
            || existing.negotiationId !== input.negotiationId
            || existing.userId !== input.userId
            || existing.decision !== input.decision
            || existing.appliedStage !== (input.stage ?? null)
            || !sameStrings(existing.appliedTags, requestedTags)
          ) throw new CrmDecisionConflictError();
          return toAnalysisDecisionView(existing);
        }

        const analysis = await transaction.aiAnalysis.findFirst({
          where: {
            id: input.analysisId,
            workspaceId: input.workspaceId,
            negotiationId: input.negotiationId,
            state: 'completed',
          },
          include: {
            decision: true,
            negotiation: { select: { contactId: true, version: true, stage: true } },
          },
        });
        if (!analysis) throw new CrmNotFoundError();
        if (analysis.decision) throw new CrmDecisionConflictError();
        if (analysis.negotiation.version !== input.expectedVersion) throw new CrmConflictError();

        let resultingVersion = analysis.negotiation.version;
        const events: Prisma.OutboxEventCreateManyInput[] = [];
        if (input.decision === 'accepted') {
          const contact = await transaction.contact.findFirstOrThrow({
            where: { id: analysis.negotiation.contactId, workspaceId: input.workspaceId },
            select: { tags: true },
          });
          const mergedTags = [...new Set([...contact.tags, ...requestedTags])];
          if (mergedTags.length > 20) throw new CrmTagLimitError();

          const updated = await transaction.negotiation.updateMany({
            where: {
              id: input.negotiationId,
              workspaceId: input.workspaceId,
              version: input.expectedVersion,
            },
            data: {
              ...(input.stage !== undefined ? {
                stage: input.stage,
                closedAt: input.stage === 'closed_won' || input.stage === 'closed_lost' ? new Date() : null,
              } : {}),
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) throw new CrmConflictError();
          resultingVersion += 1;

          if (requestedTags.length) {
            await transaction.contact.update({
              where: { id: analysis.negotiation.contactId },
              data: { tags: mergedTags },
            });
            events.push({
              workspaceId: input.workspaceId,
              aggregateType: 'contact',
              aggregateId: analysis.negotiation.contactId,
              eventType: 'contact.updated',
              payload: { workspaceId: input.workspaceId, contactId: analysis.negotiation.contactId, changedFields: ['tags'] },
            });
          }
          if (input.stage !== undefined) {
            events.push({
              workspaceId: input.workspaceId,
              aggregateType: 'negotiation',
              aggregateId: input.negotiationId,
              eventType: 'negotiation.stage.changed',
              payload: { workspaceId: input.workspaceId, negotiationId: input.negotiationId, stage: input.stage },
            });
          }
        }

        const decision = await transaction.analysisDecision.create({
          data: {
            id: input.decisionId,
            workspaceId: input.workspaceId,
            analysisId: input.analysisId,
            negotiationId: input.negotiationId,
            userId: input.userId,
            decision: input.decision,
            appliedStage: input.decision === 'accepted' ? input.stage ?? null : null,
            appliedTags: input.decision === 'accepted' ? requestedTags : [],
            resultingNegotiationVersion: resultingVersion,
          },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            contactId: analysis.negotiation.contactId,
            negotiationId: input.negotiationId,
            action: input.decision === 'accepted' ? 'analysis_accepted' : 'analysis_ignored',
            changedFields: input.decision === 'accepted'
              ? [...(input.stage !== undefined ? ['stage'] : []), ...(requestedTags.length ? ['tags'] : [])]
              : [],
            previousVersion: analysis.negotiation.version,
            resultingVersion,
            details: input.decision === 'accepted' && input.stage !== undefined
              ? { previousStage: analysis.negotiation.stage, resultingStage: input.stage }
              : {},
          },
        });
        events.push({
          workspaceId: input.workspaceId,
          aggregateType: 'analysis_decision',
          aggregateId: decision.id,
          eventType: 'analysis.decision.changed',
          payload: {
            workspaceId: input.workspaceId,
            decisionId: decision.id,
            analysisId: input.analysisId,
            negotiationId: input.negotiationId,
            decision: input.decision,
          },
        });
        await transaction.outboxEvent.createMany({ data: events });
        return toAnalysisDecisionView(decision);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (isPrismaError(error, 'P2002')) throw new CrmDecisionConflictError();
      if (isPrismaError(error, 'P2034')) throw new CrmConflictError();
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaError(error, 'P2002');
}

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toAnalysisDecisionView(decision: {
  id: string;
  decision: 'accepted' | 'ignored';
  appliedStage: NegotiationStage | null;
  appliedTags: string[];
  resultingNegotiationVersion: number;
  createdAt: Date;
}): AnalysisDecisionView {
  return {
    id: decision.id,
    decision: decision.decision,
    appliedStage: decision.appliedStage,
    appliedTags: decision.appliedTags,
    resultingNegotiationVersion: decision.resultingNegotiationVersion,
    createdAt: decision.createdAt.toISOString(),
  };
}

function toAuditEventView(event: {
  id: string;
  action: AuditEventView['action'];
  changedFields: string[];
  previousVersion: number | null;
  resultingVersion: number | null;
  details: unknown;
  createdAt: Date;
  user: { displayName: string };
}): AuditEventView {
  return {
    id: event.id,
    action: event.action,
    actorDisplayName: event.user.displayName,
    changedFields: event.changedFields,
    previousVersion: event.previousVersion,
    resultingVersion: event.resultingVersion,
    details: toAuditDetails(event.details),
    createdAt: event.createdAt.toISOString(),
  };
}

function toAuditDetails(value: unknown): AuditEventView['details'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const details = value as Record<string, unknown>;
  const stage = (name: string) => isNegotiationStage(details[name]) ? details[name] : undefined;
  return {
    ...(stage('previousStage') ? { previousStage: stage('previousStage') } : {}),
    ...(stage('resultingStage') ? { resultingStage: stage('resultingStage') } : {}),
  };
}

function isNegotiationStage(value: unknown): value is NegotiationStage {
  return typeof value === 'string' && [
    'lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost',
  ].includes(value);
}

function normalizeSearchPhone(search: string): string {
  return search.replace(/\D/g, '');
}

function toContactView(contact: {
  id: string; displayName: string; phoneNumber: string; tags: string[]; source: string;
  status: string; notes: string | null; lastInteractionAt: Date | null;
}): ContactView {
  return {
    id: contact.id,
    displayName: contact.displayName,
    phoneNumber: contact.phoneNumber,
    tags: contact.tags,
    source: contact.source,
    status: contact.status,
    notes: contact.notes,
    lastInteractionAt: contact.lastInteractionAt?.toISOString() ?? null,
  };
}

function toNegotiationView(negotiation: {
  id: string; contactId: string; title: string | null; stage: NegotiationStage;
  value: { toString(): string } | null; currency: string; sentiment: string | null;
  version: number; updatedAt: Date; contact: { displayName: string };
}): NegotiationView {
  return {
    id: negotiation.id,
    contactId: negotiation.contactId,
    contactName: negotiation.contact.displayName,
    title: negotiation.title,
    stage: negotiation.stage,
    value: negotiation.value?.toString() ?? null,
    currency: negotiation.currency,
    sentiment: negotiation.sentiment,
    version: negotiation.version,
    updatedAt: negotiation.updatedAt.toISOString(),
  };
}

function toAnalysisEntities(value: unknown): {
  product: string | null;
  amount: string | null;
  deadline: string | null;
} | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entities = value as Record<string, unknown>;
  const field = (name: string) => typeof entities[name] === 'string' ? entities[name] : null;
  return { product: field('product'), amount: field('amount'), deadline: field('deadline') };
}
