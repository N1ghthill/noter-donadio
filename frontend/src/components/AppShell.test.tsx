import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';

vi.mock('../auth/AuthContext.js', () => ({
  useAuth: () => ({
    user: { displayName: 'Admin fictício', email: 'admin@example.test' },
    logout: vi.fn(),
  }),
}));

vi.mock('../realtime/RealtimeContext.js', () => ({
  useRealtime: () => ({ connected: true, revision: 1 }),
}));

describe('estrutura autenticada', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resume pendências derivadas da agenda e oferece navegação para o piloto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      periodDays: 30,
      contactsCount: 4,
      activeNegotiationsCount: 3,
      pipelineValue: '1000',
      overdueFollowUpsCount: 2,
      todayFollowUpsCount: 1,
      missingFollowUpsCount: 1,
      wonCount: 0,
      lostCount: 0,
      winRatePercent: null,
      newContactsCount: 1,
      createdNegotiationsCount: 1,
      wonValue: '0',
      averageWonValue: null,
      stages: [],
      recentNegotiations: [],
    }), { status: 200 })));

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>Conteúdo</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = await screen.findByRole('button', { name: 'Pendências: 4' });
    fireEvent.click(trigger);
    expect(screen.getByRole('link', { name: 'Ações vencidas: 2' })).toHaveAttribute('href', '/agenda?followUp=overdue');
    expect(screen.getByRole('link', { name: 'Piloto' })).toHaveAttribute('href', '/piloto');
  });
});
