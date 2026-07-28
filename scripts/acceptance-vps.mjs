#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';

const origin = new URL(process.env.ACCEPTANCE_ORIGIN ?? 'https://leadcontrol.online').origin;
const workspace = requiredEnvironment('ACCEPTANCE_WORKSPACE');
const email = requiredEnvironment('ACCEPTANCE_EMAIL');
const password = requiredEnvironment('ACCEPTANCE_PASSWORD');
const runMutations = process.env.ACCEPTANCE_MUTATIONS === '1';

let primaryCookie;

try {
  primaryCookie = await login();
  await expectStatus('/api/auth/me', 200);
  await expectStatus('/api/dashboard?periodDays=30', 200);
  await expectStatus('/api/contacts', 200);
  await expectStatus('/api/negotiations', 200);
  await expectStatus('/api/conversations', 200);
  await expectStatus('/api/audit-events?limit=10', 200);
  report('Leituras autenticadas e projeções REST');

  if (runMutations) {
    await exerciseSessionRevocation();
    await exerciseCrmJourney();
    await exerciseFakeMessagePipeline();
    await exerciseWorkspaceExport();
  }

  report(runMutations
    ? 'Homologação autenticada concluída com mutações fictícias'
    : 'Smoke autenticado concluído em modo somente leitura');
} finally {
  if (primaryCookie) {
    await api('/api/auth/logout', {
      method: 'POST',
      cookie: primaryCookie,
      expectedStatus: 204,
    }).catch(() => undefined);
  }
}

async function exerciseSessionRevocation() {
  const secondaryCookie = await login();
  const sessions = await api('/api/auth/sessions');
  const secondarySession = sessions.data
    .filter((session) => !session.current)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  invariant(secondarySession, 'A segunda sessão não apareceu na listagem');

  await api(`/api/auth/sessions/${secondarySession.id}`, {
    method: 'DELETE',
    body: { confirmation: secondarySession.id },
    expectedStatus: 204,
  });
  await api('/api/auth/me', { cookie: secondaryCookie, expectedStatus: 401 });
  report('Segunda sessão criada, listada e revogada');
}

async function exerciseCrmJourney() {
  const displayName = 'Empresa Aurora — cenário fictício';
  const contactList = await api(`/api/contacts?search=${encodeURIComponent(displayName)}`);
  let contact = contactList.data.find((item) => item.displayName === displayName);

  if (!contact) {
    contact = await api('/api/contacts', {
      method: 'POST',
      expectedStatus: 201,
      body: {
        displayName,
        phoneNumber: '5571000000099',
        tags: ['homologação', 'fictício'],
        notes: 'Registro exclusivamente fictício para demonstração do produto.',
      },
    });
  }

  const title = 'Implantação CRM — homologação';
  const negotiationList = await api(`/api/negotiations?search=${encodeURIComponent(title)}`);
  let negotiation = negotiationList.data.find(
    (item) => item.title === title && item.contactId === contact.id,
  );

  if (!negotiation) {
    negotiation = await api('/api/negotiations', {
      method: 'POST',
      expectedStatus: 201,
      body: {
        contactId: contact.id,
        title,
        stage: 'lead',
        value: '18500.00',
        expectedCloseDate: dateAfter(14),
        productInterest: 'Organização do atendimento comercial',
        nextAction: 'Realizar reunião de diagnóstico',
        nextActionDueDate: dateAfter(1),
      },
    });
  }

  negotiation = await api(`/api/negotiations/${negotiation.id}`, {
    method: 'PATCH',
    body: {
      expectedVersion: negotiation.version,
      title,
      value: '18500.00',
      expectedCloseDate: dateAfter(14),
      productInterest: 'Organização do atendimento comercial',
      nextAction: 'Realizar reunião de diagnóstico',
      nextActionDueDate: dateAfter(1),
    },
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}/stage`, {
    method: 'PATCH',
    body: { stage: 'qualified', expectedVersion: negotiation.version },
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}/next-action/complete`, {
    method: 'POST',
    body: { expectedVersion: negotiation.version },
  });

  await api(`/api/negotiations/${negotiation.id}/stage`, {
    method: 'PATCH',
    body: { stage: 'closed_won', expectedVersion: negotiation.version },
    expectedStatus: 400,
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}/stage`, {
    method: 'PATCH',
    body: {
      stage: 'closed_won',
      expectedVersion: negotiation.version,
      closeReason: 'Cenário fictício validado durante a homologação.',
    },
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}/stage`, {
    method: 'PATCH',
    body: { stage: 'qualified', expectedVersion: negotiation.version },
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}`, {
    method: 'PATCH',
    body: {
      expectedVersion: negotiation.version,
      nextAction: 'Apresentar proposta comercial fictícia',
      nextActionDueDate: dateAfter(2),
    },
  });
  negotiation = await api(`/api/negotiations/${negotiation.id}/stage`, {
    method: 'PATCH',
    body: { stage: 'proposal_sent', expectedVersion: negotiation.version },
  });

  const detail = await api(`/api/negotiations/${negotiation.id}`);
  invariant(detail.stage === 'proposal_sent', 'A negociação não terminou na etapa esperada');
  invariant(detail.followUpHistory.length > 0, 'O histórico da próxima ação não foi persistido');
  invariant(detail.closeReason === null, 'A reabertura não removeu o motivo de fechamento');
  report('Contato, negociação, Kanban, próxima ação, fechamento e reabertura');
}

async function exerciseFakeMessagePipeline() {
  const setup = await api('/api/whatsapp/setup', { method: 'POST' });
  invariant(setup.adapter === 'fake' && setup.qrCode, 'O setup não retornou o QR fictício');
  const connected = await api('/api/whatsapp/demo/connect', { method: 'POST' });
  invariant(connected.status === 'connected', 'A conexão simulada não foi concluída');

  const textStartedAt = Date.now();
  const textInput = {
    clientMessageId: randomUUID(),
    messageType: 'text',
    content: 'Mensagem fictícia para validar a organização do atendimento comercial.',
  };
  const firstText = await api('/api/whatsapp/demo/messages', {
    method: 'POST',
    body: textInput,
    expectedStatus: 201,
  });
  const repeatedText = await api('/api/whatsapp/demo/messages', {
    method: 'POST',
    body: textInput,
    expectedStatus: 200,
  });
  invariant(!firstText.duplicate && repeatedText.duplicate, 'A deduplicação da mensagem divergiu');

  let textDetail = await waitFor('análise da mensagem fictícia', async () => {
    const detail = await api(`/api/negotiations/${firstText.negotiationId}`);
    const analysis = recentCompletedAnalysis(detail, textStartedAt);
    return analysis ? { detail, analysis } : null;
  });
  const decision = await api(
    `/api/negotiations/${firstText.negotiationId}/analyses/${textDetail.analysis.id}/decision`,
    {
      method: 'POST',
      body: {
        decisionId: randomUUID(),
        decision: 'accepted',
        expectedVersion: textDetail.detail.version,
        tags: ['homologação'],
        nextAction: 'Revisar a conversa fictícia',
        nextActionDueDate: dateAfter(1),
      },
    },
  );
  invariant(decision.decision === 'accepted', 'A sugestão não foi aceita explicitamente');

  const audioStartedAt = Date.now();
  const audio = await api('/api/whatsapp/demo/messages', {
    method: 'POST',
    expectedStatus: 201,
    body: { clientMessageId: randomUUID(), messageType: 'audio' },
  });
  const audioDetail = await waitFor('transcrição do áudio fictício', async () => {
    const detail = await api(`/api/negotiations/${audio.negotiationId}`);
    const message = detail.messages.find((item) => item.id === audio.messageId);
    const analysis = recentCompletedAnalysis(detail, audioStartedAt);
    return message?.media?.transcriptionState === 'completed' && analysis
      ? { detail, message }
      : null;
  });
  invariant(audioDetail.message.media.playbackAvailable, 'O áudio fictício não ficou disponível');

  const access = await api(`/api/media/${audio.messageId}/access`);
  const mediaResponse = await globalThis.fetch(new URL(access.url, origin), {
    headers: { cookie: primaryCookie },
  });
  invariant(mediaResponse.ok, 'A URL assinada da mídia fictícia falhou');
  invariant((await mediaResponse.arrayBuffer()).byteLength > 0, 'A mídia fictícia está vazia');
  report('QR, conexão falsa, deduplicação, IA assistiva, áudio, transcrição e mídia');
}

async function exerciseWorkspaceExport() {
  const document = await api('/api/privacy/workspace-export');
  invariant(document.schemaVersion === 'workspace-export-v1', 'A exportação possui versão inesperada');
  invariant(document.workspace.slug === workspace, 'A exportação retornou outro workspace');

  const audit = await api('/api/audit-events?limit=100');
  const actions = new Set(audit.data.map((event) => event.action));
  for (const action of [
    'negotiation_follow_up_completed',
    'negotiation_stage_changed',
    'analysis_accepted',
    'workspace_exported',
  ]) {
    invariant(actions.has(action), `A auditoria não contém ${action}`);
  }
  report('Exportação administrativa e auditoria minimizada');
}

async function login() {
  const response = await globalThis.fetch(new URL('/api/auth/login', origin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ workspace, email, password }),
  });
  invariant(response.status === 200, `Login retornou HTTP ${response.status}`);
  const setCookie = response.headers.get('set-cookie') ?? '';
  invariant(/;\s*HttpOnly/i.test(setCookie), 'Cookie sem HttpOnly');
  invariant(/;\s*Secure/i.test(setCookie), 'Cookie sem Secure');
  invariant(/;\s*SameSite=Strict/i.test(setCookie), 'Cookie sem SameSite=Strict');
  const cookie = setCookie.split(';', 1)[0];
  invariant(cookie.startsWith('noter_session='), 'Cookie de sessão ausente');
  return cookie;
}

async function expectStatus(path, status) {
  await api(path, { expectedStatus: status });
}

async function api(path, options = {}) {
  const method = options.method ?? 'GET';
  const headers = {
    accept: 'application/json',
    ...(options.cookie ?? primaryCookie ? { cookie: options.cookie ?? primaryCookie } : {}),
    ...(method === 'GET' || method === 'HEAD' ? {} : { origin }),
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
  };
  const response = await globalThis.fetch(new URL(path, origin), {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const expectedStatus = options.expectedStatus ?? 200;
  invariant(
    response.status === expectedStatus,
    `${method} ${path.split('?')[0]} retornou HTTP ${response.status}; esperado ${expectedStatus}`,
  );
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  invariant(contentType.includes('application/json'), `${method} ${path.split('?')[0]} não retornou JSON`);
  return response.json();
}

async function waitFor(description, operation) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await delay(500);
  }
  throw new Error(`Tempo excedido aguardando ${description}`);
}

function recentCompletedAnalysis(detail, startedAt) {
  return detail.analyses.find((analysis) => (
    analysis.state === 'completed'
    && !analysis.decision
    && Date.parse(analysis.createdAt) >= startedAt - 10_000
  ));
}

function dateAfter(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Defina ${name}`);
  return value;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function report(message) {
  process.stdout.write(`OK — ${message}\n`);
}
