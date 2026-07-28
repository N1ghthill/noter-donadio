import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type {
  OrphanMediaCandidate,
  OrphanMediaStorage,
} from '../domain/media-orphan-reconciliation.js';
import type { MediaStorage } from '../domain/media-storage.js';

const UUID_PATTERN = '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const STORAGE_KEY_PATTERN = new RegExp(`^${UUID_PATTERN}/${UUID_PATTERN}\\.(?:wav|media)$`);
const WORKSPACE_PATTERN = new RegExp(`^${UUID_PATTERN}$`);
const ORPHAN_FILE_PATTERN = new RegExp(`^${UUID_PATTERN}\\.media$`);

export class LocalMediaStorage implements MediaStorage, OrphanMediaStorage {
  private readonly root: string;

  public constructor(rootPath: string, private readonly maxBytes: number) {
    this.root = resolve(rootPath);
  }

  public async write(storageKey: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > this.maxBytes) throw new MediaTooLargeError();
    const path = this.pathFor(storageKey);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error: unknown) {
      if (!isFileExistsError(error)) throw error;
      const existing = await readFile(path);
      if (!existing.equals(bytes)) throw new MediaStorageConflictError();
    }
  }

  public async read(storageKey: string): Promise<Buffer> {
    const bytes = await readFile(this.pathFor(storageKey));
    if (bytes.byteLength > this.maxBytes) throw new MediaTooLargeError();
    return bytes;
  }

  public async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  public async listOrphanCandidates(
    limit: number,
    afterStorageKey?: string,
  ): Promise<readonly OrphanMediaCandidate[]> {
    const candidates: OrphanMediaCandidate[] = [];
    let workspaces;
    try {
      workspaces = await readdir(this.root, { withFileTypes: true });
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return [];
      throw error;
    }
    for (const workspace of workspaces.sort((left, right) => compareNames(left.name, right.name))) {
      if (candidates.length >= limit) break;
      if (!workspace.isDirectory() || !WORKSPACE_PATTERN.test(workspace.name)) continue;
      const workspacePath = resolve(this.root, workspace.name);
      const files = await readdir(workspacePath, { withFileTypes: true });
      for (const file of files.sort((left, right) => compareNames(left.name, right.name))) {
        if (candidates.length >= limit) break;
        if (!file.isFile() || !ORPHAN_FILE_PATTERN.test(file.name)) continue;
        const storageKey = `${workspace.name}/${file.name}`;
        if (afterStorageKey !== undefined && storageKey <= afterStorageKey) continue;
        const metadata = await lstat(this.pathFor(storageKey));
        if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
        candidates.push({ storageKey, modifiedAt: metadata.mtime });
      }
    }
    return candidates;
  }

  private pathFor(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new InvalidStorageKeyError();
    }
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}${sep}`)) throw new InvalidStorageKeyError();
    return path;
  }
}

export class MediaTooLargeError extends Error {}
export class MediaStorageConflictError extends Error {}
export class InvalidStorageKeyError extends Error {}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function compareNames(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
