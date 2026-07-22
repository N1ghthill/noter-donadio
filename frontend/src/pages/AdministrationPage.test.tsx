import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdministrationPage } from './AdministrationPage.js';

const logout = vi.fn();
vi.mock('../auth/AuthContext.js', () => ({
  useAuth: () => ({ status: 'authenticated', user: null, logout }),
}));

describe('administração', () => {
  afterEach(() => { vi.unstubAllGlobals(); logout.mockReset(); });

  it('lista e revoga uma sessão com confirmação explícita', async () => {
    const sessionId = '54eb359b-6fb4-4d51-8c07-8c55ac7efd65';
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ data: [{
        id: sessionId, current: false, createdAt: '2026-07-21T10:00:00.000Z',
        lastSeenAt: '2026-07-21T12:00:00.000Z', expiresAt: '2026-07-21T20:00:00.000Z',
      }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AdministrationPage />);
    expect(await screen.findByText('Outra sessão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/auth/sessions/${sessionId}`,
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirmation: sessionId }) }),
    ));
  });

  it('baixa a exportação administrativa com o nome fornecido pelo servidor', async () => {
    const fetchMock = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/api/privacy/workspace-export') return new Response('{}', {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="noter-demo-2026-07-21.json"' },
      });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:exportacao');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<AdministrationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar dados do workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/privacy/workspace-export', { credentials: 'include' },
    ));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:exportacao');
    click.mockRestore();
  });
});
