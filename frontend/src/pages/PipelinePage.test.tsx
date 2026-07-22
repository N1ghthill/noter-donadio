import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PipelinePage } from './PipelinePage.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
}));

const contactId = '3a3db76b-c51a-4584-ab4b-6d3e70952e44';

describe('pipeline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cria uma negociação manual sem enviar identidade confiada pelo cliente', async () => {
    const fetchMock = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/contacts') {
        return new Response(JSON.stringify({
          data: [{
            id: contactId,
            displayName: 'Contato fictício',
            phoneNumber: '5571000000000',
            tags: [],
            source: 'manual',
            status: 'active',
            notes: null,
            lastInteractionAt: null,
          }],
        }), { status: 200 });
      }
      if (path === '/api/negotiations' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          id: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb',
          contactId,
          contactName: 'Contato fictício',
          title: 'Projeto fictício',
          stage: 'qualified',
          value: '1250.50',
          currency: 'BRL',
          sentiment: null,
          nextAction: 'Enviar proposta',
          nextActionDueDate: '2026-08-20',
          version: 1,
          updatedAt: '2026-07-21T12:00:00.000Z',
        }), { status: 201 });
      }
      if (path === '/api/negotiations/278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb/stage' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          id: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb', contactId, contactName: 'Contato fictício',
          title: 'Projeto acompanhado', stage: 'closed_won', value: null, currency: 'BRL',
          sentiment: null, nextAction: 'Retornar ao contato', nextActionDueDate: '2020-01-01',
          version: 2, updatedAt: '2026-07-21T12:00:00.000Z',
        }), { status: 200 });
      }
      if (path === '/api/negotiations') {
        return new Response(JSON.stringify({
          data: [{
            id: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb',
            contactId,
            contactName: 'Contato fictício',
            title: 'Projeto acompanhado',
            stage: 'qualified',
            value: null,
            currency: 'BRL',
            sentiment: null,
            nextAction: 'Retornar ao contato',
            nextActionDueDate: '2020-01-01',
            version: 1,
            updatedAt: '2026-07-21T12:00:00.000Z',
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('Contrato confirmado pelo cliente'));

    render(
      <MemoryRouter>
        <RealtimeProvider><PipelinePage /></RealtimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Retornar ao contato')).toBeInTheDocument();
    const card = screen.getByText('Projeto acompanhado').closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText(/Vencida/)).toBeInTheDocument();
    fireEvent.change(within(card as HTMLElement).getByLabelText('Etapa'), { target: { value: 'closed_won' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb/stage',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'closed_won', expectedVersion: 1, closeReason: 'Contrato confirmado pelo cliente',
        }),
      }),
    ));
    fireEvent.click(await screen.findByRole('button', { name: 'Nova negociação' }));
    const creationPanel = screen.getByRole('heading', { name: 'Criar negociação' }).closest('section');
    expect(creationPanel).not.toBeNull();
    const creationForm = within(creationPanel as HTMLElement);
    fireEvent.change(creationForm.getByLabelText('Contato'), { target: { value: contactId } });
    fireEvent.change(creationForm.getByLabelText('Título'), { target: { value: 'Projeto fictício' } });
    fireEvent.change(creationForm.getByLabelText('Etapa'), { target: { value: 'qualified' } });
    fireEvent.change(creationForm.getByLabelText('Valor estimado (R$)'), { target: { value: '1250.50' } });
    fireEvent.change(creationForm.getByLabelText('Previsão de fechamento'), { target: { value: '2026-08-15' } });
    fireEvent.change(creationForm.getByLabelText('Produto ou interesse'), { target: { value: 'Serviço fictício' } });
    fireEvent.change(creationForm.getByLabelText('Próxima ação'), { target: { value: 'Enviar proposta' } });
    fireEvent.change(creationForm.getByLabelText('Prazo da próxima ação'), { target: { value: '2026-08-20' } });
    fireEvent.click(creationForm.getByRole('button', { name: 'Salvar negociação' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          contactId,
          stage: 'qualified',
          title: 'Projeto fictício',
          value: '1250.50',
          expectedCloseDate: '2026-08-15',
          productInterest: 'Serviço fictício',
          nextAction: 'Enviar proposta',
          nextActionDueDate: '2026-08-20',
        }),
      }),
    ));
    expect(screen.queryByRole('heading', { name: 'Criar negociação' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Acompanhamento'), { target: { value: 'overdue' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations?followUp=overdue', expect.objectContaining({ credentials: 'include' }),
    ));
  });
});
