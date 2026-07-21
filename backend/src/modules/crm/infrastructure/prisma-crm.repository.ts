import type { NegotiationStage } from '@noter/contracts';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import { normalizePhoneNumber } from '../../../shared/domain/phone.js';
import {
  CrmConflictError,
  CrmNotFoundError,
  type ContactView,
  type CrmRepository,
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
    displayName: string;
    phoneNumber: string;
    tags: readonly string[];
    notes?: string | undefined;
  }) {
    const contact = await this.prisma.contact.create({
      data: {
        workspaceId: input.workspaceId,
        displayName: input.displayName,
        phoneNumber: normalizePhoneNumber(input.phoneNumber),
        tags: [...input.tags],
        notes: input.notes ?? null,
        source: 'manual',
      },
    });
    return toContactView(contact);
  }

  public async listNegotiations(workspaceId: string, stage: NegotiationStage | undefined) {
    const negotiations = await this.prisma.negotiation.findMany({
      where: { workspaceId, ...(stage ? { stage } : {}) },
      include: { contact: { select: { displayName: true } } },
      orderBy: [{ stage: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
    return negotiations.map(toNegotiationView);
  }

  public async updateNegotiationStage(input: {
    workspaceId: string;
    negotiationId: string;
    stage: NegotiationStage;
    expectedVersion: number;
  }) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.negotiation.findFirst({
        where: { id: input.negotiationId, workspaceId: input.workspaceId },
        select: { id: true },
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
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function normalizeSearchPhone(search: string): string {
  return search.replace(/\D/g, '');
}

function toContactView(contact: {
  id: string; displayName: string; phoneNumber: string; tags: string[]; source: string;
  status: string; lastInteractionAt: Date | null;
}): ContactView {
  return {
    id: contact.id,
    displayName: contact.displayName,
    phoneNumber: contact.phoneNumber,
    tags: contact.tags,
    source: contact.source,
    status: contact.status,
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
