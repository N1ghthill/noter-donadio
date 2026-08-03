export interface OutboxRetentionRepository {
  deletePublishedBefore(cutoff: Date, limit: number): Promise<number>;
}

export class OutboxRetentionService {
  public constructor(
    private readonly repository: OutboxRetentionRepository,
    private readonly retentionMs: number,
  ) {}

  public runBatch(now = new Date(), limit = 100): Promise<number> {
    return this.repository.deletePublishedBefore(new Date(now.getTime() - this.retentionMs), limit);
  }
}
