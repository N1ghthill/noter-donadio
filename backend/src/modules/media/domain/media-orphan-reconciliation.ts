export interface OrphanMediaCandidate {
  readonly storageKey: string;
  readonly modifiedAt: Date;
}

export interface OrphanMediaStorage {
  listOrphanCandidates(
    limit: number,
    afterStorageKey?: string,
  ): Promise<readonly OrphanMediaCandidate[]>;
  delete(storageKey: string): Promise<void>;
}

export interface MediaReferenceRepository {
  findReferencedStorageKeys(storageKeys: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface MediaOrphanReconciliationResult {
  readonly selected: number;
  readonly referenced: number;
  readonly removed: number;
}

export class MediaOrphanReconciliationService {
  public constructor(
    private readonly repository: MediaReferenceRepository,
    private readonly storage: OrphanMediaStorage,
    private readonly gracePeriodMs: number,
  ) {}

  public async runBatch(
    now = new Date(),
    limit = 100,
  ): Promise<MediaOrphanReconciliationResult> {
    const cutoff = new Date(now.getTime() - this.gracePeriodMs);
    let afterStorageKey: string | undefined;
    let selected = 0;
    let referenced = 0;
    let removed = 0;
    while (removed < limit) {
      const page = await this.storage.listOrphanCandidates(limit, afterStorageKey);
      if (page.length === 0) break;
      afterStorageKey = page.at(-1)?.storageKey;
      const candidates = page.filter((candidate) => candidate.modifiedAt <= cutoff);
      selected += candidates.length;
      const referencedKeys = candidates.length === 0
        ? new Set<string>()
        : await this.repository.findReferencedStorageKeys(
          candidates.map((candidate) => candidate.storageKey),
        );
      for (const candidate of candidates) {
        if (referencedKeys.has(candidate.storageKey)) {
          referenced += 1;
          continue;
        }
        await this.storage.delete(candidate.storageKey);
        removed += 1;
        if (removed >= limit) break;
      }
      if (page.length < limit) break;
    }
    return { selected, referenced, removed };
  }
}
