import assert from 'node:assert/strict';
import test from 'node:test';

import { OutboxRetentionService, type OutboxRetentionRepository } from './outbox-retention.js';

test('retenção calcula o corte e delega um lote limitado', async () => {
  let received: { cutoff: Date; limit: number } | undefined;
  const repository: OutboxRetentionRepository = {
    async deletePublishedBefore(cutoff, limit) { received = { cutoff, limit }; return 12; },
  };
  const removed = await new OutboxRetentionService(repository, 7 * 86_400_000)
    .runBatch(new Date('2026-08-02T12:00:00.000Z'), 50);
  assert.equal(removed, 12);
  assert.equal(received?.cutoff.toISOString(), '2026-07-26T12:00:00.000Z');
  assert.equal(received?.limit, 50);
});
