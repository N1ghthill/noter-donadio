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
});
