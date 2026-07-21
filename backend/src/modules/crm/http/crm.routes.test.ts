import assert from 'node:assert/strict';
import test from 'node:test';

import type { NegotiationStage } from '@noter/contracts';

import { buildApp } from '../../../app.js';
import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import {
  CrmConflictError,
  CrmDecisionConflictError,
  type AnalysisDecisionView,
  type ContactView,
  type CrmRepository,
  type NegotiationDetailView,
  type NegotiationView,
} from '../domain/crm.repository.js';

const WORKSPACE_ID = '0e723f84-ec81-441e-b816-f3f179f25fe2';
const NEGOTIATION_ID = 'db71084e-5829-4a90-8346-5832998294ea';
const ANALYSIS_ID = 'c7edac69-9eca-4763-9302-8363f2f91a72';
const USER_ID = 'd86e2931-7552-41f6-831f-85dd34c8bf29';
const SESSION_COOKIE = 'noter_session=valid-session-token-with-more-than-forty-characters';

class FakeCrmRepository implements CrmRepository {
  public lastWorkspaceId?: string;
  public lastContactUpdate?: { workspaceId: string; contactId: string; displayName?: string };
  public lastAnalysisDecision?: Parameters<CrmRepository['decideAnalysis']>[0];
  public async listContacts(workspaceId: string): Promise<ContactView[]> {
    this.lastWorkspaceId = workspaceId;
    return [];
  }
  public async createContact(): Promise<ContactView> { throw new Error('not used'); }
  public async updateContact(input: {
    workspaceId: string; contactId: string; displayName?: string;
  }): Promise<ContactView> {
    this.lastContactUpdate = input;
    return {
      id: input.contactId,
      displayName: input.displayName ?? 'Contato',
      phoneNumber: '5571999999999',
      tags: [],
      source: 'manual',
      status: 'active',
      notes: null,
      lastInteractionAt: null,
    };
  }
  public async listNegotiations(): Promise<NegotiationView[]> { return []; }
  public async getNegotiation(workspaceId: string, negotiationId: string): Promise<NegotiationDetailView> {
    this.lastWorkspaceId = workspaceId;
    return {
      id: negotiationId,
      contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
      contactName: 'Contato',
      title: 'Proposta',
      stage: 'lead',
      value: null,
      currency: 'BRL',
      sentiment: null,
      version: 1,
      updatedAt: '2026-07-20T12:00:00.000Z',
      contact: {
        id: '3a3db76b-c51a-4584-ab4b-6d3e70952e44', displayName: 'Contato',
        phoneNumber: '5571999999999', tags: [], source: 'manual', status: 'active',
        notes: null, lastInteractionAt: null,
      },
      messages: [],
      analyses: [],
    };
  }
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
  public async decideAnalysis(input: Parameters<CrmRepository['decideAnalysis']>[0]): Promise<AnalysisDecisionView> {
    this.lastAnalysisDecision = input;
    if (input.expectedVersion !== 1) throw new CrmConflictError();
    if (input.decisionId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') throw new CrmDecisionConflictError();
    return {
      id: input.decisionId,
      decision: input.decision,
      appliedStage: input.decision === 'accepted' ? input.stage ?? null : null,
      appliedTags: input.decision === 'accepted' ? input.tags ?? [] : [],
      resultingNegotiationVersion: input.decision === 'accepted' ? 2 : 1,
      createdAt: '2026-07-21T06:00:00.000Z',
    };
  }
}

class FakeSessionAuthenticator implements SessionAuthenticator {
  public async authenticate(token: string | undefined) {
    return token === 'valid-session-token-with-more-than-forty-characters'
      ? {
          userId: USER_ID,
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

test('detalhe da negociação usa o workspace autenticado', async (context) => {
  const repository = new FakeCrmRepository();
  const app = buildApp({
    crmRepository: repository,
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'GET',
    url: `/api/negotiations/${NEGOTIATION_ID}`,
    headers: { cookie: SESSION_COOKIE },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(repository.lastWorkspaceId, WORKSPACE_ID);
  assert.equal(response.json().id, NEGOTIATION_ID);
});

test('edição de contato valida sessão e encaminha apenas dados aceitos', async (context) => {
  const repository = new FakeCrmRepository();
  const app = buildApp({
    crmRepository: repository,
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const contactId = '3a3db76b-c51a-4584-ab4b-6d3e70952e44';
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/contacts/${contactId}`,
    headers: { cookie: SESSION_COOKIE },
    payload: { displayName: 'Nome atualizado' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(repository.lastContactUpdate, {
    workspaceId: WORKSPACE_ID,
    contactId,
    displayName: 'Nome atualizado',
  });
});

test('mudança de estágio sem sessão retorna 401', async (context) => {
  const app = buildApp({
    crmRepository: new FakeCrmRepository(),
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/negotiations/${NEGOTIATION_ID}/stage`,
    payload: { stage: 'qualified', expectedVersion: 1 },
  });
  assert.equal(response.statusCode, 401);
});

test('cadastro recusa telefone sem dígitos suficientes na fronteira HTTP', async (context) => {
  const app = buildApp({
    crmRepository: new FakeCrmRepository(),
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/contacts',
    headers: { cookie: SESSION_COOKIE },
    payload: { displayName: 'Contato', phoneNumber: 'telefone inválido' },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'invalid_request' });
});

test('aceita sugestões editadas com identidade e workspace da sessão', async (context) => {
  const repository = new FakeCrmRepository();
  const app = buildApp({
    crmRepository: repository,
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const decisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const response = await app.inject({
    method: 'POST',
    url: `/api/negotiations/${NEGOTIATION_ID}/analyses/${ANALYSIS_ID}/decision`,
    headers: { cookie: SESSION_COOKIE },
    payload: {
      decisionId,
      decision: 'accepted',
      expectedVersion: 1,
      stage: 'proposal_sent',
      tags: ['prioridade'],
      workspaceId: 'f35cd133-89aa-4614-84c1-16392b68199e',
    },
  });
  assert.equal(response.statusCode, 400);

  const validResponse = await app.inject({
    method: 'POST',
    url: `/api/negotiations/${NEGOTIATION_ID}/analyses/${ANALYSIS_ID}/decision`,
    headers: { cookie: SESSION_COOKIE },
    payload: { decisionId, decision: 'accepted', expectedVersion: 1, stage: 'proposal_sent', tags: ['prioridade'] },
  });
  assert.equal(validResponse.statusCode, 200);
  assert.deepEqual(repository.lastAnalysisDecision, {
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    negotiationId: NEGOTIATION_ID,
    analysisId: ANALYSIS_ID,
    decisionId,
    decision: 'accepted',
    expectedVersion: 1,
    stage: 'proposal_sent',
    tags: ['prioridade'],
  });
});

test('ignorar sugestão recusa campos aplicáveis e conflito de versão', async (context) => {
  const app = buildApp({
    crmRepository: new FakeCrmRepository(),
    sessionAuthenticator: new FakeSessionAuthenticator(),
  });
  context.after(async () => app.close());
  const invalid = await app.inject({
    method: 'POST',
    url: `/api/negotiations/${NEGOTIATION_ID}/analyses/${ANALYSIS_ID}/decision`,
    headers: { cookie: SESSION_COOKIE },
    payload: {
      decisionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      decision: 'ignored',
      expectedVersion: 1,
      tags: ['não permitido'],
    },
  });
  assert.equal(invalid.statusCode, 400);

  const conflict = await app.inject({
    method: 'POST',
    url: `/api/negotiations/${NEGOTIATION_ID}/analyses/${ANALYSIS_ID}/decision`,
    headers: { cookie: SESSION_COOKIE },
    payload: {
      decisionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      decision: 'ignored',
      expectedVersion: 99,
    },
  });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.json(), { error: 'version_conflict' });
});
