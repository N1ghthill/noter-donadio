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

  it('consulta o detalhe de uma negociação pelo identificador', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'neg-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.negotiation('neg-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/negotiations/neg-1', expect.objectContaining({
      credentials: 'include',
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

  it('inicia setup e leitura simulada sem enviar dados do workspace', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: 'connected' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.startWhatsappSetup();
    await api.simulateWhatsappConnection();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/whatsapp/setup', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/whatsapp/demo/connect', expect.objectContaining({ method: 'POST' }));
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
});
