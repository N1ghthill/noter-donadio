import assert from 'node:assert/strict';
import test from 'node:test';

import { parseInboundMessageNotificationJob } from './notification-job.js';

const payload = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  messageId: '22222222-2222-4222-8222-222222222222',
  milestone: 'analysis_completed' as const,
};

test('reduz o job aos IDs necessários', () => {
  assert.deepEqual(parseInboundMessageNotificationJob('notification.milestone', payload), {
    workspaceId: payload.workspaceId,
    messageId: payload.messageId,
    milestone: 'analysis_completed',
  });
});

test('rejeita evento ou payload fora do contrato estrito', () => {
  assert.throws(() => parseInboundMessageNotificationJob('message.text.ingested', payload));
  assert.throws(() => parseInboundMessageNotificationJob('notification.milestone', {
    ...payload,
    content: 'não deve trafegar',
  }));
});
