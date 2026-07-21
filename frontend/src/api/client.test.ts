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
});
