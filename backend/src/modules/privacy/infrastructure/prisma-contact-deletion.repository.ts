import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type {
  ContactDeletionRepository,
  PendingMediaDeletion,
} from '../domain/contact-deletion.js';

export class PrismaContactDeletionRepository implements ContactDeletionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async deleteContactAndScheduleMedia(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
  }): Promise<readonly PendingMediaDeletion[] | null> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.deleteContactAndScheduleMediaOnce(input);
      } catch (error: unknown) {
        if (!isPrismaWriteConflict(error) || attempt === 3) throw error;
      }
    }
    throw new Error('unreachable_contact_deletion_retry');
  }

  private async deleteContactAndScheduleMediaOnce(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
  }): Promise<readonly PendingMediaDeletion[] | null> {
    return this.prisma.$transaction(async (transaction) => {
      const contact = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "contacts"
        WHERE "id" = ${input.contactId}::uuid
          AND "workspace_id" = ${input.workspaceId}::uuid
        FOR UPDATE
      `);
      if (!contact[0]) return null;

      const media = await transaction.mediaAsset.findMany({
        where: {
          workspaceId: input.workspaceId,
          storageKey: { not: null },
          message: { contactId: input.contactId },
        },
        select: { storageKey: true },
      });
      const storageKeys = media.flatMap((asset) => asset.storageKey ? [asset.storageKey] : []);
      const negotiations = await transaction.negotiation.findMany({
        where: { workspaceId: input.workspaceId, contactId: input.contactId },
        select: { id: true },
      });
      if (storageKeys.length) {
        await transaction.mediaDeletionTask.createMany({
          data: storageKeys.map((storageKey) => ({ workspaceId: input.workspaceId, storageKey })),
          skipDuplicates: true,
        });
      }

      await transaction.auditEvent.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          contactId: input.contactId,
          action: 'contact_deleted',
          details: { associatedMediaCount: storageKeys.length },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          aggregateType: 'contact',
          aggregateId: input.contactId,
          eventType: 'contact.deleted',
          payload: { workspaceId: input.workspaceId, contactId: input.contactId },
        },
      });
      await transaction.auditEvent.updateMany({
        where: {
          workspaceId: input.workspaceId,
          OR: [
            { contactId: input.contactId },
            { negotiationId: { in: negotiations.map((negotiation) => negotiation.id) } },
          ],
        },
        data: { contactId: null, negotiationId: null },
      });
      await transaction.contact.delete({ where: { id: input.contactId } });

      return storageKeys.length
        ? transaction.mediaDeletionTask.findMany({
            where: { workspaceId: input.workspaceId, storageKey: { in: storageKeys } },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  public async listPendingMedia(limit: number): Promise<readonly PendingMediaDeletion[]> {
    return this.prisma.mediaDeletionTask.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  public async completeMediaDeletion(task: PendingMediaDeletion): Promise<boolean> {
    const deleted = await this.prisma.mediaDeletionTask.deleteMany({
      where: { id: task.id, workspaceId: task.workspaceId, storageKey: task.storageKey },
    });
    return deleted.count === 1;
  }
}

function isPrismaWriteConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}
