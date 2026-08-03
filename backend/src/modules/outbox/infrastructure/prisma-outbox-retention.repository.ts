import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { OutboxRetentionRepository } from '../domain/outbox-retention.js';

export class PrismaOutboxRetentionRepository implements OutboxRetentionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async deletePublishedBefore(cutoff: Date, limit: number): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const records = await transaction.outboxEvent.findMany({
        where: { status: 'published', publishedAt: { lt: cutoff } },
        select: { id: true }, orderBy: { publishedAt: 'asc' }, take: limit,
      });
      if (records.length === 0) return 0;
      const result = await transaction.outboxEvent.deleteMany({
        where: { id: { in: records.map(({ id }) => id) }, status: 'published', publishedAt: { lt: cutoff } },
      });
      return result.count;
    });
  }
}
