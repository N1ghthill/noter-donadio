import assert from 'node:assert/strict';
import test from 'node:test';

import type { NegotiationStage } from '@noter/contracts';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import {
  CrmConflictError,
  type ContactView,
  type CrmRepository,
  type NegotiationView,
} from '../domain/crm.repository.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const NEGOTIATION_ID = 'db71084e-5829-4a90-8346-5832998294ea';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

class FakeCrmRepository implements CrmRepository {
  public lastWorkspaceId?: string;
  public async listContacts(workspaceId: string): Promise<ContactView[]> {
    this.lastWorkspaceId = workspaceId;
    return [];
  }
  public async createContact(): Promise<ContactView> { throw new Error('not used'); }
  public async listNegotiations(): Promise<NegotiationView[]> { return []; }
  public async updateNegotiationStage(input: {
    workspaceId: string; negotiationId: string; stage: NegotiationStage; expectedVersion: number;
  }): Promise<NegotiationView> {
    if (input.expectedVersion !== 1) throw new CrmConflictError();
    return {
      id: input.negotiationId,
      contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
      contactName: 'Contato',
      title: null,
      stage: input.stage,
      value: null,
      currency: 'BRL',
      sentiment: null,
      version: 2,
      updatedAt: '2026-07-20T12:00:00.000Z',
    };
  }
}

class FakeSessionAuthenticator implements SessionAuthenticator {
  public async authenticate(token: string | undefined) {
    return token === 'valid-session-token-with-more-than-forty-characters'
      ? {
          userId: 'd86e2931-7552-41f6-831f-85dd34c8bf29',
          workspaceId: WORKSPACE_ID,
          email: 'admin@example.test',
          displayName: 'Admin',
          role: 'admin' as const,
        }
      : null;
  }
}

test('rotas do CRM exigem sessão de usuário', async (context) => {
  const app = buildApp({
    crmRepository: new FakeCrmRepository(),
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/contacts' });
  assert.equal(response.statusCode, 401);
});

test('workspace do CRM vem da sessão autenticada', async (context) => {
  const repository = new FakeCrmRepository();
  const app = buildApp({
    crmRepository: repository,
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'GET', url: '/api/contacts', headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(repository.lastWorkspaceId, WORKSPACE_ID);
});

test('conflito otimista de estágio retorna 409', async (context) => {
  const app = buildApp({
    crmRepository: new FakeCrmRepository(),
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/negotiations/${NEGOTIATION_ID}/stage`,
    headers: { cookie: SESSION_COOKIE },
    payload: { stage: 'qualified', expectedVersion: 99 },
  });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { error: 'version_conflict' });
});
