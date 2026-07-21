import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EventPublisher,
  OutboxRepository,
  PendingOutboxEvent,
} from './outbox-dispatcher.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';

class FakeOutboxRepository implements OutboxRepository {
  public published: string[] = [];
  public failed: Array<{ id: string; code: string }> = [];

  public constructor(private readonly events: PendingOutboxEvent[]) {}
  public async claimBatch(limit: number) { return this.events.slice(0, limit); }
  public async markPublished(id: string) { this.published.push(id); }
  public async markFailed(id: string, code: string) { this.failed.push({ id, code }); }
}

class SelectivePublisher implements EventPublisher {
  public async publish(event: PendingOutboxEvent) {
    if (event.eventType === 'message.audio.ingested') {
      throw Object.assign(new Error('conteúdo que não deve ser persistido'), { code: 'REDIS_DOWN' });
    }
  }
}

test('publica eventos independentemente e persiste somente código seguro da falha', async () => {
  const repository = new FakeOutboxRepository([
    { id: 'text', eventType: 'message.text.ingested', payload: {}, attempts: 1 },
    { id: 'audio', eventType: 'message.audio.ingested', payload: {}, attempts: 1 },
  ]);
  const dispatcher = new OutboxDispatcher(repository, new SelectivePublisher());

  const summary = await dispatcher.dispatchBatch();

  assert.deepEqual(summary, { claimed: 2, published: 1, failed: 1 });
  assert.deepEqual(repository.published, ['text']);
  assert.deepEqual(repository.failed, [{ id: 'audio', code: 'REDIS_DOWN' }]);
});
