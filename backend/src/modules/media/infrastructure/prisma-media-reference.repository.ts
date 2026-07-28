import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { MediaReferenceRepository } from '../domain/media-orphan-reconciliation.js';

export class PrismaMediaReferenceRepository implements MediaReferenceRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findReferencedStorageKeys(
    storageKeys: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (storageKeys.length === 0) return new Set();
    const records = await this.prisma.mediaAsset.findMany({
      where: { storageKey: { in: [...storageKeys] } },
      select: { storageKey: true },
    });
    return new Set(records.flatMap((record) => record.storageKey ? [record.storageKey] : []));
  }
}
