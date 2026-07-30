import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthContext.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';
import { HomePage } from './HomePage.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('home operacional', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('apresenta prioridades e atalhos funcionais', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/me') return response({ user: {
        userId: 'user-1', workspaceId: 'workspace-1', email: 'admin@example.test',
        displayName: 'Ana Donadio', role: 'admin',
      } });
      if (url === '/api/dashboard?periodDays=30') return response({
        periodDays: 30,
        contactsCount: 10,
        activeNegotiationsCount: 4,
        pipelineValue: '1000',
        overdueFollowUpsCount: 2,
        todayFollowUpsCount: 3,
        missingFollowUpsCount: 1,
        wonCount: 1,
        lostCount: 0,
        winRatePercent: '100.00',
        newContactsCount: 1,
        createdNegotiationsCount: 1,
        wonValue: '1000',
        averageWonValue: '1000',
        stages: [],
        recentNegotiations: [],
      });
      if (url.startsWith('/api/conversations?')) return response({ data: [] });
      return response({ error: 'not_found' }, 404);
    }));

    render(
      <MemoryRouter>
        <AuthProvider><RealtimeProvider><HomePage /></RealtimeProvider></AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tarefas para hoje/ })).toHaveAttribute('href', '/agenda?followUp=today');
    expect(screen.getByRole('link', { name: /Arquivos por contato/ })).toHaveAttribute('href', '/arquivos');
    expect(screen.getByRole('link', { name: /Piloto do cliente/ })).toHaveAttribute('href', '/piloto');
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
