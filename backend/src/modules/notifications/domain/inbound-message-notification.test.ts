import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InboundMessageNotificationService,
  NotificationDeliveryFailedError,
  type InboundMessageNotificationRepository,
  type NotificationClaim,
  type NotificationTarget,
} from './inbound-message-notification.js';

const target: NotificationTarget = {
  deliveryId: 'delivery-1',
  workspaceId: 'workspace-1',
  messageId: 'message-1',
  attemptId: 'attempt-1',
  milestone: 'message_received',
  variant: 'message_received',
};

test('envia e conclui uma entrega adquirida', async () => {
  let notifications = 0;
  let completedTarget: NotificationTarget | undefined;
  const repository = repositoryStub({ status: 'claimed', target }, {
    complete: async (claimedTarget) => {
      completedTarget = claimedTarget;
      return true;
    },
  });
  const service = new InboundMessageNotificationService(
    repository,
    { notify: async () => { notifications += 1; } },
    new Date('2026-08-10T12:00:00Z'),
  );

  const result = await service.execute(
    'workspace-1',
    'message-1',
    'message_received',
    new Date('2026-08-10T12:05:00Z'),
  );

  assert.deepEqual(result, { status: 'completed' });
  assert.equal(notifications, 1);
  assert.deepEqual(completedTarget, target);
});

test('não chama o provedor para entrega já concluída', async () => {
  let notifications = 0;
  const service = new InboundMessageNotificationService(
    repositoryStub({ status: 'completed' }),
    { notify: async () => { notifications += 1; } },
    new Date('2026-08-10T12:00:00Z'),
  );

  assert.deepEqual(
    await service.execute('workspace-1', 'message-1', 'message_received'),
    { status: 'completed' },
  );
  assert.equal(notifications, 0);
});

test('marca falha com código sanitizado e permite retry da fila', async () => {
  let failureCode: string | undefined;
  const repository = repositoryStub({ status: 'claimed', target }, {
    fail: async (_claimedTarget, code) => { failureCode = code; },
  });
  const service = new InboundMessageNotificationService(
    repository,
    { notify: async () => { throw Object.assign(new Error('detalhe externo'), { code: 'BARK_HTTP_ERROR' }); } },
    new Date('2026-08-10T12:00:00Z'),
  );

  await assert.rejects(
    service.execute('workspace-1', 'message-1', 'message_received'),
    (error: unknown) => error instanceof NotificationDeliveryFailedError
      && error.code === 'BARK_HTTP_ERROR',
  );
  assert.equal(failureCode, 'BARK_HTTP_ERROR');
});

function repositoryStub(
  claim: NotificationClaim,
  overrides: Partial<InboundMessageNotificationRepository> = {},
): InboundMessageNotificationRepository {
  return {
    claim: async () => claim,
    complete: async () => true,
    fail: async () => undefined,
    ...overrides,
  };
}
