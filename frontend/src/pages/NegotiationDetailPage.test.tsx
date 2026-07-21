import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      contact: {
        id: 'contact-1', displayName: 'Contato fictício', phoneNumber: '5571000000000',
        tags: ['demonstração'], source: 'manual', status: 'active', notes: null,
        lastInteractionAt: '2026-07-20T18:30:00.000Z',
      },
      messages: [{
        id: 'message-1', direction: 'inbound', messageType: 'audio', content: null,
        occurredAt: '2026-07-20T18:30:00.000Z',
        media: { transcriptionState: 'completed', transcriptionText: 'Podemos agendar uma apresentação?', durationSeconds: 18, mimeType: 'audio/ogg' },
      }],
      analyses: [{
        id: 'analysis-1', state: 'completed', summary: 'Contato interessado.', sentiment: 'positive',
        entities: { product: 'Produto fictício', amount: null, deadline: null },
        objections: [], nextActions: ['Agendar demonstração'], suggestedTags: ['demonstração'],
        suggestedStage: 'proposal_sent', confidenceScore: '0.91', promptVersion: 'demo-v1',
        modelUsed: 'demo-local', createdAt: '2026-07-20T18:31:00.000Z', decision: null,
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

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
    expect(screen.getByText('Agendar demonstração')).toBeInTheDocument();
    expect(screen.getByText('Produto fictício')).toBeInTheDocument();
    expect(screen.getByText('demonstração')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar seleção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignorar sugestão' })).toBeInTheDocument();
    expect(screen.getByText('A IA apenas sugere; toda aplicação exige confirmação e fica auditada.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ignorar sugestão' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/neg-1/analyses/analysis-1/decision',
      expect.objectContaining({ method: 'POST' }),
    ));
    const decisionCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(decisionCall?.[1]?.body))).toEqual(expect.objectContaining({
      decision: 'ignored',
      expectedVersion: 1,
    }));
  });
});
