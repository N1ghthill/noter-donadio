import assert from 'node:assert/strict';
import test from 'node:test';

import { isActiveNegotiation, NEGOTIATION_STAGES } from './negotiations.js';

test('somente etapas finais encerram uma negociação', () => {
  const activeStages = NEGOTIATION_STAGES.filter(isActiveNegotiation);

  assert.deepEqual(activeStages, [
    'lead',
    'qualified',
    'proposal_sent',
    'in_negotiation',
    'on_hold',
  ]);
  assert.equal(isActiveNegotiation('closed_won'), false);
  assert.equal(isActiveNegotiation('closed_lost'), false);
});
