import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { MediaStorage } from '../domain/media-storage.js';

export class LocalMediaStorage implements MediaStorage {
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

  private pathFor(storageKey: string): string {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.wav$/.test(storageKey)) throw new InvalidStorageKeyError();
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
