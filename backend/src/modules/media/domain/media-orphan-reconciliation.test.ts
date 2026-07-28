import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MediaOrphanReconciliationService,
  type OrphanMediaCandidate,
} from './media-orphan-reconciliation.js';

test('remove somente arquivos antigos sem referência no banco', async () => {
  const deleted: string[] = [];
  const candidates: readonly OrphanMediaCandidate[] = [
    { storageKey: 'workspace/old-orphan.media', modifiedAt: new Date('2026-07-26T10:00:00.000Z') },
    { storageKey: 'workspace/old-referenced.media', modifiedAt: new Date('2026-07-26T11:00:00.000Z') },
    { storageKey: 'workspace/recent.media', modifiedAt: new Date('2026-07-28T11:30:00.000Z') },
  ];
  const service = new MediaOrphanReconciliationService({
    async findReferencedStorageKeys(storageKeys) {
      assert.deepEqual(storageKeys, [
        'workspace/old-orphan.media',
        'workspace/old-referenced.media',
      ]);
      return new Set(['workspace/old-referenced.media']);
    },
  }, {
    async listOrphanCandidates(limit, afterStorageKey) {
      assert.equal(limit, 10);
      assert.equal(afterStorageKey, undefined);
      return candidates;
    },
    async delete(storageKey) {
      deleted.push(storageKey);
    },
  }, 24 * 60 * 60 * 1_000);

  assert.deepEqual(
    await service.runBatch(new Date('2026-07-28T12:00:00.000Z'), 10),
    { selected: 2, referenced: 1, removed: 1 },
  );
  assert.deepEqual(deleted, ['workspace/old-orphan.media']);
});

test('não consulta o banco quando não há candidato fora da janela de segurança', async () => {
  let queried = false;
  const service = new MediaOrphanReconciliationService({
    async findReferencedStorageKeys() {
      queried = true;
      return new Set();
    },
  }, {
    async listOrphanCandidates() {
      return [{
        storageKey: 'workspace/recent.media',
        modifiedAt: new Date('2026-07-28T11:30:00.000Z'),
      }];
    },
    async delete() {},
  }, 24 * 60 * 60 * 1_000);

  assert.deepEqual(
    await service.runBatch(new Date('2026-07-28T12:00:00.000Z')),
    { selected: 0, referenced: 0, removed: 0 },
  );
  assert.equal(queried, false);
});

test('avança depois de uma página inteira de arquivos referenciados', async () => {
  const deleted: string[] = [];
  const pages: Record<string, readonly OrphanMediaCandidate[]> = {
    first: [
      { storageKey: 'workspace/a.media', modifiedAt: new Date('2026-07-26T10:00:00.000Z') },
      { storageKey: 'workspace/b.media', modifiedAt: new Date('2026-07-26T10:00:00.000Z') },
    ],
    'workspace/b.media': [
      { storageKey: 'workspace/c.media', modifiedAt: new Date('2026-07-26T10:00:00.000Z') },
    ],
  };
  const service = new MediaOrphanReconciliationService({
    async findReferencedStorageKeys(storageKeys) {
      return new Set(storageKeys.filter((key) => key !== 'workspace/c.media'));
    },
  }, {
    async listOrphanCandidates(_limit, afterStorageKey) {
      return pages[afterStorageKey ?? 'first'] ?? [];
    },
    async delete(storageKey) {
      deleted.push(storageKey);
    },
  }, 24 * 60 * 60 * 1_000);

  assert.deepEqual(
    await service.runBatch(new Date('2026-07-28T12:00:00.000Z'), 2),
    { selected: 3, referenced: 2, removed: 1 },
  );
  assert.deepEqual(deleted, ['workspace/c.media']);
});
