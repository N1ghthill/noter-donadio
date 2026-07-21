import assert from 'node:assert/strict';
import test from 'node:test';

import { MediaRetentionService, type ExpiredMedia } from './media-retention.js';

test('remove o arquivo antes de minimizar o registro expirado', async () => {
  const order: string[] = [];
  const expired: ExpiredMedia = {
    id: 'asset-1',
    workspaceId: 'workspace-1',
    storageKey: 'workspace-1/message-1.wav',
  };
  const service = new MediaRetentionService({
    async listExpired(_now, limit) {
      assert.equal(limit, 10);
      return [expired];
    },
    async markRemoved(media) {
      order.push(`database:${media.id}`);
      return true;
    },
  }, {
    async write() {},
    async read() { return Buffer.alloc(0); },
    async delete(key) { order.push(`storage:${key}`); },
  });

  assert.deepEqual(await service.runBatch(new Date('2026-07-21T12:00:00.000Z'), 10), { selected: 1, removed: 1 });
  assert.deepEqual(order, ['storage:workspace-1/message-1.wav', 'database:asset-1']);
});
