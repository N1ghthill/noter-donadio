import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealtimeProvider } from '../realtime/RealtimeContext.js';
import { AgendaPage } from './AgendaPage.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('agenda de follow-ups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('filtra tarefas, mostra classificação e conclui com confirmação', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/next-action/complete') && init?.method === 'POST') {
        return response({ ...task, nextAction: null, version: 2 });
      }
      if (url.startsWith('/api/negotiations')) return response({ data: [task] });
      return response({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(
      <MemoryRouter initialEntries={['/agenda?followUp=today']}>
        <RealtimeProvider><AgendaPage /></RealtimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Enviar proposta')).toBeInTheDocument();
    expect(screen.getByText('Qualificado')).toBeInTheDocument();
    expect(screen.getByText('Contato pediu uma proposta comercial.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/negotiations/${task.id}/next-action/complete`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
    ));
  });
});

const task = {
  id: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb',
  contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
  contactName: 'Contato fictício',
  title: 'Projeto',
  stage: 'lead',
  value: null,
  currency: 'BRL',
  sentiment: 'positive',
  aiSummary: 'Contato pediu uma proposta comercial.',
  aiSuggestedStage: 'qualified',
  aiSuggestedTags: ['proposta'],
  nextAction: 'Enviar proposta',
  nextActionDueDate: '2026-07-29',
  version: 1,
  updatedAt: '2026-07-29T12:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
