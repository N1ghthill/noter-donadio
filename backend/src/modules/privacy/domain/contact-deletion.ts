export interface PendingMediaDeletion {
  readonly id: string;
  readonly workspaceId: string;
  readonly storageKey: string;
}

export interface ContactDeletionRepository {
  deleteContactAndScheduleMedia(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
  }): Promise<readonly PendingMediaDeletion[] | null>;
  listPendingMedia(limit: number): Promise<readonly PendingMediaDeletion[]>;
  completeMediaDeletion(task: PendingMediaDeletion): Promise<boolean>;
}

export interface PrivateMediaRemover {
  delete(storageKey: string): Promise<void>;
}

export interface ContactDeletionResult {
  readonly deleted: boolean;
  readonly completedMedia: number;
  readonly pendingMedia: number;
}

export class ContactDeletionService {
  public constructor(
    private readonly repository: ContactDeletionRepository,
    private readonly media: PrivateMediaRemover,
  ) {}

  public async deleteContact(input: {
    workspaceId: string;
    userId: string;
    contactId: string;
  }): Promise<ContactDeletionResult> {
    const tasks = await this.repository.deleteContactAndScheduleMedia(input);
    if (!tasks) return { deleted: false, completedMedia: 0, pendingMedia: 0 };
    const result = await this.removeMedia(tasks);
    return { deleted: true, ...result };
  }

  public async flushPendingMedia(limit = 100): Promise<{
    selected: number;
    completedMedia: number;
    pendingMedia: number;
  }> {
    const tasks = await this.repository.listPendingMedia(limit);
    return { selected: tasks.length, ...await this.removeMedia(tasks) };
  }

  private async removeMedia(tasks: readonly PendingMediaDeletion[]): Promise<{
    completedMedia: number;
    pendingMedia: number;
  }> {
    let completedMedia = 0;
    for (const task of tasks) {
      try {
        await this.media.delete(task.storageKey);
        if (await this.repository.completeMediaDeletion(task)) completedMedia += 1;
      } catch {
        // A tarefa durável permanece para uma nova tentativa do worker.
      }
    }
    return { completedMedia, pendingMedia: tasks.length - completedMedia };
  }
}
