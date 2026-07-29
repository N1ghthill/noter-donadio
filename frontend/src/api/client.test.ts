import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from './client.js';

describe('cliente HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envia credenciais e codifica a busca de contatos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.contacts('Ana & Cia');

    expect(fetchMock).toHaveBeenCalledWith('/api/contacts?search=Ana%20%26%20Cia', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('consulta agregados do dashboard com período explícito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ periodDays: 90 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.dashboard(90);

    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard?periodDays=90', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('lista e revoga sessões com confirmação do identificador', async () => {
    const sessionId = '54eb359b-6fb4-4d51-8c07-8c55ac7efd65';
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ data: [] }), { status: 200 })
    ));
    vi.stubGlobal('fetch', fetchMock);

    await api.sessions();
    await api.revokeSession(sessionId);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/sessions', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/auth/sessions/${sessionId}`, expect.objectContaining({
      method: 'DELETE', body: JSON.stringify({ confirmation: sessionId }),
    }));
  });

  it('obtém a exportação como arquivo sem interpretar seu conteúdo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"schemaVersion":"workspace-export-v1"}', {
      status: 200,
      headers: { 'content-disposition': 'attachment; filename="noter-demo-2026-07-21.json"' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.workspaceExport();

    expect(result.filename).toBe('noter-demo-2026-07-21.json');
    expect(await result.blob.text()).toContain('workspace-export-v1');
    expect(fetchMock).toHaveBeenCalledWith('/api/privacy/workspace-export', { credentials: 'include' });
  });

  it('consulta a auditoria global com limite explícito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.auditEvents(25);

    expect(fetchMock).toHaveBeenCalledWith('/api/audit-events?limit=25', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('transforma respostas de erro em ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_credentials' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(api.login({ workspace: 'acme', email: 'ana@example.com', password: 'senha-segura' }))
      .rejects.toEqual(expect.objectContaining({ status: 401, code: 'invalid_credentials' }));
  });

  it('envia a versão esperada ao mover uma negociação', async () => {
    const response = { id: 'neg-1', stage: 'qualified', version: 4 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateNegotiationStage('neg-1', { stage: 'qualified', expectedVersion: 3 });

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations/neg-1/stage', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ stage: 'qualified', expectedVersion: 3 }),
    }));
  });

  it('envia motivo de encerramento e conclui a próxima ação com versão', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ id: 'neg-1' }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateNegotiationStage('neg-1', {
      stage: 'closed_lost', expectedVersion: 4, closeReason: 'Orçamento adiado',
    });
    await api.completeNextAction('neg-1', 5);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/negotiations/neg-1/stage', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ stage: 'closed_lost', expectedVersion: 4, closeReason: 'Orçamento adiado' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/negotiations/neg-1/next-action/complete', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ expectedVersion: 5 }),
    }));
  });

  it('codifica filtros comerciais no servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.negotiations({
      stage: 'qualified',
      followUp: 'overdue',
      activeOnly: true,
      search: 'Ana & Cia',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations?stage=qualified&followUp=overdue&activeOnly=true&search=Ana+%26+Cia',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('cria negociação manual sem enviar workspace ou valores numéricos flutuantes', async () => {
    const response = { id: 'neg-1', stage: 'lead', version: 1 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      contactId: 'contact-1',
      title: 'Projeto fictício',
      stage: 'lead' as const,
      value: '12500.50',
      nextAction: 'Enviar proposta',
      nextActionDueDate: '2026-08-20',
    };

    await api.createNegotiation(input);

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }));
  });

  it('consulta o detalhe de uma negociação pelo identificador', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'neg-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.negotiation('neg-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations/neg-1', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('edita dados comerciais com versão e decimais em string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'neg-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      expectedVersion: 3,
      value: '9800.75',
      expectedCloseDate: '2026-09-30',
      productInterest: 'Serviço confirmado',
      nextAction: 'Retornar ao contato',
      nextActionDueDate: '2026-08-25',
    };

    await api.updateNegotiation('neg-1', input);

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations/neg-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify(input),
    }));
  });

  it('registra decisão idempotente com a versão e seleção explícitas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'decision-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      decisionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      decision: 'accepted' as const,
      expectedVersion: 3,
      stage: 'proposal_sent' as const,
      tags: ['prioridade'],
      value: '7500.25',
      expectedCloseDate: '2026-09-30',
      productInterest: 'Serviço confirmado',
      nextAction: 'Agendar apresentação',
      nextActionDueDate: '2026-09-15',
    };

    await api.decideAnalysis('neg-1', 'analysis-1', input);

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations/neg-1/analyses/analysis-1/decision', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }));
  });

  it('envia somente os campos escolhidos na edição do contato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'contact-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateContact('contact-1', { displayName: 'Nome atualizado' });

    expect(fetchMock).toHaveBeenCalledWith('/api/contacts/contact-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Nome atualizado' }),
    }));
  });

  it('confirma a exclusão usando somente o identificador do contato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.deleteContact('contact-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/contacts/contact-1', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'contact-1' }),
    }));
  });

  it('inicia setup e leitura simulada sem enviar dados do workspace', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: 'connected' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.startWhatsappSetup();
    await api.simulateWhatsappConnection();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/whatsapp/setup', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/whatsapp/demo/connect', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('content-type');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty('content-type');
  });

  it('confirma a substituição do WhatsApp somente com o identificador da conta', async () => {
    const accountId = '2f31a180-6127-48cd-82da-7b324e49a31d';
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ accountId, status: 'disconnected' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await api.resetWhatsappAuthentication(accountId);

    expect(fetchMock).toHaveBeenCalledWith('/api/whatsapp/session', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ confirmation: accountId }),
    }));
  });

  it('consulta conversas e simula entrada com chave idempotente', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ data: [] }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      clientMessageId: '11b3f58b-4f89-47f2-93bc-89be57028a48',
      content: 'Mensagem fictícia.',
    };

    await api.conversations();
    await api.simulateInboundMessage(input);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/conversations', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/whatsapp/demo/messages', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }));
  });

  it('codifica período e classificações ao consultar conversas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.conversations({
      startedFrom: '2026-07-29T00:00:00.000Z',
      startedTo: '2026-07-30T00:00:00.000Z',
      stage: 'lead',
      aiStage: 'qualified',
      search: 'Ana & Cia',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations?startedFrom=2026-07-29T00%3A00%3A00.000Z'
        + '&startedTo=2026-07-30T00%3A00%3A00.000Z&stage=lead&aiStage=qualified'
        + '&search=Ana+%26+Cia',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('consulta arquivos por contato sem receber uma chave física', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.files({ contactId: 'contact-1', search: 'áudio inicial' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files?contactId=contact-1&search=%C3%A1udio+inicial',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
