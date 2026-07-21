import { render, screen } from '@testing-library/react';
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
        objections: [], nextActions: ['Agendar demonstração'], suggestedTags: ['demonstração'],
        suggestedStage: 'proposal_sent', confidenceScore: '0.91', createdAt: '2026-07-20T18:31:00.000Z',
      }],
    }), { status: 200 })));

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
    expect(screen.getByText('Sugestões não são aplicadas automaticamente.')).toBeInTheDocument();
  });
});
