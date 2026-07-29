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
      if (url === '/api/conversations') return response({ data: [conversation] });
      if (url === '/api/negotiations/deal-1') return response(detail);
      if (url === '/api/whatsapp/demo/messages' && init?.method === 'POST') {
        return response({ messageId: 'message-2', contactId: 'contact-1', negotiationId: 'deal-1', duplicate: false }, 201);
      }
      return response({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <RealtimeProvider><ConversationsPage /></RealtimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Contato fictício')).toBeInTheDocument();
    expect(await screen.findByText('Histórico preservado.')).toBeInTheDocument();

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
    const audioDetail = {
      ...detail,
      messages: [{
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
          playbackAvailable: true,
        },
      }],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/capabilities') return response({
        demoSimulationEnabled: false,
        audioTranscriptionEnabled: false,
        messageAnalysisEnabled: false,
      });
      if (url === '/api/conversations') return response({ data: [conversation] });
      if (url === '/api/negotiations/deal-1') return response(audioDetail);
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
    expect(screen.queryByText('Entrada simulada')).not.toBeInTheDocument();
  });
});

const conversation = {
  negotiationId: 'deal-1',
  contactId: 'contact-1',
  contactName: 'Contato fictício',
  stage: 'lead',
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
  analyses: [],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
