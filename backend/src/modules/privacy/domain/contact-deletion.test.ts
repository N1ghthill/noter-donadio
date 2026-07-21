import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ContactDeletionService,
  type ContactDeletionRepository,
  type PendingMediaDeletion,
} from './contact-deletion.js';

const task: PendingMediaDeletion = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  storageKey: 'workspace-1/message-1.wav',
};

test('exclusão lógica termina mesmo se a remoção física ficar pendente', async () => {
  let completed = false;
  const repository: ContactDeletionRepository = {
    async deleteContactAndScheduleMedia() { return [task]; },
    async listPendingMedia() { return [task]; },
    async completeMediaDeletion() { completed = true; return true; },
  };
  const service = new ContactDeletionService(repository, {
    async delete() { throw new Error('storage_unavailable'); },
  });

  assert.deepEqual(await service.deleteContact({
    workspaceId: 'workspace-1', userId: 'user-1', contactId: 'contact-1',
  }), { deleted: true, completedMedia: 0, pendingMedia: 1 });
  assert.equal(completed, false);
});

test('worker remove arquivo antes de concluir a tarefa durável', async () => {
  const order: string[] = [];
  const repository: ContactDeletionRepository = {
    async deleteContactAndScheduleMedia() { return null; },
    async listPendingMedia(limit) { assert.equal(limit, 10); return [task]; },
    async completeMediaDeletion(item) { order.push(`database:${item.id}`); return true; },
  };
  const service = new ContactDeletionService(repository, {
    async delete(key) { order.push(`storage:${key}`); },
  });

  assert.deepEqual(await service.flushPendingMedia(10), {
    selected: 1, completedMedia: 1, pendingMedia: 0,
  });
  assert.deepEqual(order, ['storage:workspace-1/message-1.wav', 'database:task-1']);
});
