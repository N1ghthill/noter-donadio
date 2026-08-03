import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealtimeProvider } from '../realtime/RealtimeContext.js';
import { ConversationsPage } from './ConversationsPage.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('caixa de conversas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('abre o histórico e simula uma mensagem recebida', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/capabilities') return response({
        demoSimulationEnabled: true,
        audioTranscriptionEnabled: true,
        messageAnalysisEnabled: true,
      });
      if (url.startsWith('/api/conversations?')) return response({
        data: [conversation],
        meta: { limit: 50, offset: 0, hasMore: false, nextOffset: null },
      });
      if (url === '/api/negotiations/deal-1?messageScope=contact') return response(detail);
      if (url === '/api/whatsapp/demo/messages' && init?.method === 'POST') {
        return response({ messageId: 'message-2', contactId: 'contact-1', negotiationId: 'deal-1', duplicate: false }, 201);
      }
      return response({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/conversas?period=all&contactId=3a3db76b-c51a-4584-ab4b-6d3e70952e44']}>
        <RealtimeProvider><ConversationsPage /></RealtimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Contato fictício')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations?contactId=3a3db76b-c51a-4584-ab4b-6d3e70952e44&limit=50&offset=0',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.getByText('Contato solicitou uma proposta.')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(await screen.findByText('Histórico preservado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arquivos' })).toHaveAttribute(
      'href',
      `/arquivos?contactId=${detail.contactId}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Criar follow-up' }));
    fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Retornar amanhã' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/negotiations/deal-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"nextAction":"Retornar amanhã"'),
      }),
    ));

    fireEvent.change(screen.getByLabelText('Mensagem fictícia recebida'), {
      target: { value: 'Nova mensagem inteiramente fictícia.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simular mensagem de texto' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/whatsapp/demo/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Nova mensagem inteiramente fictícia.'),
      }),
    ));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Simular áudio recebido' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Simular áudio recebido' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/whatsapp/demo/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"messageType":"audio"'),
      }),
    ));
  });

  it('oculta simulação e informa transcrição desativada no ambiente real', async () => {
    const mediaDetail = {
      ...detail,
      messages: [
        {
          id: 'audio-1',
          direction: 'inbound',
          messageType: 'audio',
          content: null,
          occurredAt: '2026-07-21T12:00:00.000Z',
          media: {
            transcriptionState: 'pending',
            transcriptionText: null,
            durationSeconds: 3,
            mimeType: 'audio/ogg',
            fileName: 'audio.ogg',
            playbackAvailable: true,
          },
        },
        {
          id: 'image-1',
          direction: 'inbound',
          messageType: 'image',
          content: null,
          occurredAt: '2026-07-21T12:01:00.000Z',
          media: {
            transcriptionState: 'completed',
            transcriptionText: null,
            durationSeconds: null,
            mimeType: 'image/jpeg',
            fileName: 'imagem.jpg',
            playbackAvailable: true,
          },
        },
        {
          id: 'document-1',
          direction: 'outbound',
          messageType: 'document',
          content: null,
          occurredAt: '2026-07-21T12:02:00.000Z',
          media: {
            transcriptionState: 'completed',
            transcriptionText: null,
            durationSeconds: null,
            mimeType: 'application/pdf',
            fileName: 'proposta.pdf',
            playbackAvailable: true,
          },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/capabilities') return response({
        demoSimulationEnabled: false,
        audioTranscriptionEnabled: false,
        messageAnalysisEnabled: false,
      });
      if (url.startsWith('/api/conversations?')) return response({
        data: [conversation],
        meta: { limit: 50, offset: 0, hasMore: false, nextOffset: null },
      });
      if (url === '/api/negotiations/deal-1?messageScope=contact') return response(mediaDetail);
      return response({ error: 'not_found' }, 404);
    }));

    render(
      <MemoryRouter>
        <RealtimeProvider><ConversationsPage /></RealtimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(
      'Transcrição ainda não ativada. O áudio original continua disponível.',
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregar áudio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver imagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar download' })).toBeInTheDocument();
    expect(screen.getByText('imagem.jpg')).toBeInTheDocument();
    expect(screen.getByText('proposta.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Entrada simulada')).not.toBeInTheDocument();
  });
});

const conversation = {
  negotiationId: 'deal-1',
  contactId: 'contact-1',
  contactName: 'Contato fictício',
  stage: 'lead',
  title: 'Negociação fictícia',
  firstMessageAt: '2026-07-21T10:00:00.000Z',
  messageCount: 2,
  latestAnalysis: {
    state: 'completed',
    summary: 'Contato solicitou uma proposta.',
    sentiment: 'positive',
    suggestedStage: 'qualified',
    suggestedTags: ['proposta'],
    createdAt: '2026-07-21T12:01:00.000Z',
  },
  lastMessage: {
    id: 'message-1',
    direction: 'inbound',
    messageType: 'text',
    content: 'Última conversa fictícia.',
    occurredAt: '2026-07-21T12:00:00.000Z',
  },
};

const detail = {
  id: 'deal-1', contactId: 'contact-1', contactName: 'Contato fictício', title: null,
  stage: 'lead', value: null, currency: 'BRL', sentiment: null, version: 1,
  nextAction: null, nextActionDueDate: null,
  updatedAt: '2026-07-21T12:00:00.000Z',
  contact: {
    id: 'contact-1', displayName: 'Contato fictício', phoneNumber: '5571000000002',
    tags: [], source: 'whatsapp_auto', status: 'active', notes: null,
    lastInteractionAt: '2026-07-21T12:00:00.000Z',
  },
  messages: [{
    id: 'message-1', direction: 'inbound', messageType: 'text', content: 'Histórico preservado.',
    occurredAt: '2026-07-21T12:00:00.000Z', media: null,
  }],
  messagesPage: { limit: 50, offset: 0, hasMore: false, nextOffset: null },
  analyses: [],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
