import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NegotiationDetailPage } from './NegotiationDetailPage.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
}));

describe('detalhe da negociação', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exibe histórico, transcrição e sugestão sem aplicá-la', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      id: 'neg-1', contactId: 'contact-1', contactName: 'Contato fictício',
      title: 'Projeto fictício', stage: 'qualified', value: '12500', currency: 'BRL',
      sentiment: 'positive', version: 1, updatedAt: '2026-07-20T18:30:00.000Z',
      valueConfirmedAt: null, expectedCloseDate: '2026-08-31', expectedCloseDateConfirmedAt: null,
      productInterest: 'Produto atual', productInterestConfirmedAt: null,
      nextAction: 'Retornar ao contato', nextActionDueDate: '2026-08-20',
      nextActionConfirmedAt: null, nextActionDueDateConfirmedAt: null,
      closeReason: null,
      followUpHistory: [{
        id: 'follow-up-1', description: 'Enviar apresentação anterior', dueDate: '2026-07-18',
        completedAt: '2026-07-18T18:30:00.000Z', completedByDisplayName: 'Admin fictício',
      }],
      contact: {
        id: 'contact-1', displayName: 'Contato fictício', phoneNumber: '5571000000000',
        tags: ['demonstração'], source: 'manual', status: 'active', notes: null,
        lastInteractionAt: '2026-07-20T18:30:00.000Z',
      },
      messages: [{
        id: 'message-1', direction: 'inbound', messageType: 'audio', content: null,
        occurredAt: '2026-07-20T18:30:00.000Z',
        media: { transcriptionState: 'completed', transcriptionText: 'Podemos agendar uma apresentação?', durationSeconds: 18, mimeType: 'audio/ogg', playbackAvailable: true },
      }],
      analyses: [{
        id: 'analysis-1', state: 'completed', summary: 'Contato interessado.', sentiment: 'positive',
        entities: { product: 'Produto fictício', amount: '7500.25', deadline: '2026-09-30' },
        objections: [], nextActions: ['Agendar demonstração'], suggestedTags: ['demonstração'],
        suggestedStage: 'proposal_sent', confidenceScore: '0.91', promptVersion: 'demo-v1',
        modelUsed: 'demo-local', createdAt: '2026-07-20T18:31:00.000Z', decision: null,
      }],
      auditTrail: [{
        id: 'audit-1', action: 'negotiation_stage_changed', actorDisplayName: 'Admin fictício',
        changedFields: ['stage'], previousVersion: 1, resultingVersion: 2,
        details: { previousStage: 'lead', resultingStage: 'qualified' },
        createdAt: '2026-07-20T18:32:00.000Z',
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(
      <RealtimeProvider>
        <MemoryRouter initialEntries={['/pipeline/neg-1']}>
          <Routes><Route path="/pipeline/:id" element={<NegotiationDetailPage />} /></Routes>
        </MemoryRouter>
      </RealtimeProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Projeto fictício' })).toBeInTheDocument();
    expect(screen.getByText('Podemos agendar uma apresentação?')).toBeInTheDocument();
    expect(screen.getByText('Transcrição · concluída')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregar áudio' })).toBeInTheDocument();
    expect(screen.getByText('Agendar demonstração')).toBeInTheDocument();
    expect(screen.getByText('Retornar ao contato')).toBeInTheDocument();
    expect(screen.getByText(/Prazo: 20 de ago/)).toBeInTheDocument();
    expect(screen.getByText('Enviar apresentação anterior')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir ação' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/neg-1/next-action/complete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ expectedVersion: 1 }) }),
    ));
    expect(screen.getByText('Produto fictício')).toBeInTheDocument();
    expect(screen.getByText('demonstração')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar seleção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignorar sugestão' })).toBeInTheDocument();
    expect(screen.getByText('A IA apenas sugere; toda aplicação exige confirmação e fica auditada.')).toBeInTheDocument();
    expect(screen.getByText('Etapa alterada manualmente')).toBeInTheDocument();
    expect(screen.getByText('Lead → Qualificado')).toBeInTheDocument();
    expect(screen.getAllByText(/Admin fictício/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
    const commercialPanel = screen.getByRole('heading', { name: 'Dados comerciais confirmados' }).closest('section');
    expect(commercialPanel).not.toBeNull();
    const commercialForm = within(commercialPanel as HTMLElement);
    fireEvent.change(commercialForm.getByLabelText('Título'), { target: { value: 'Projeto revisado' } });
    fireEvent.change(commercialForm.getByLabelText('Valor (R$)'), { target: { value: '9800.75' } });
    fireEvent.change(commercialForm.getByLabelText('Produto ou interesse'), { target: { value: 'Produto confirmado' } });
    fireEvent.change(commercialForm.getByLabelText('Próxima ação'), { target: { value: 'Enviar proposta revisada' } });
    fireEvent.change(commercialForm.getByLabelText('Prazo da próxima ação'), { target: { value: '2026-08-25' } });
    fireEvent.click(commercialForm.getByRole('button', { name: 'Salvar dados' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/neg-1',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({
      expectedVersion: 1,
      title: 'Projeto revisado',
      value: '9800.75',
      expectedCloseDate: '2026-08-31',
      productInterest: 'Produto confirmado',
      nextAction: 'Enviar proposta revisada',
      nextActionDueDate: '2026-08-25',
    });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dados comerciais confirmados' })).not.toBeInTheDocument());
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => !init?.method).length).toBeGreaterThan(1));
    const confirmedValue = screen.getByLabelText('Valor confirmado (R$)');
    fireEvent.change(confirmedValue, { target: { value: '7500.25' } });
    expect(confirmedValue).toHaveValue(7500.25);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar seleção' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/neg-1/analyses/analysis-1/decision',
      expect.objectContaining({ method: 'POST' }),
    ));
    const decisionCall = fetchMock.mock.calls.find(([path, init]) => String(path).includes('/analyses/') && init?.method === 'POST');
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual(expect.objectContaining({
      decision: 'accepted',
      expectedVersion: 1,
      value: '7500.25',
      expectedCloseDate: '2026-09-30',
      productInterest: 'Produto fictício',
      nextAction: 'Agendar demonstração',
      nextActionDueDate: '2026-09-30',
    }));
  });
});
