import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilesPage } from './FilesPage.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('arquivos por contato', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista mídia sem expor chave interna e oferece o contexto comercial', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/contacts') return response({ data: [contact] });
      if (url.startsWith('/api/files')) return response({ data: [file] });
      return response({ error: 'not_found' }, 404);
    }));

    render(<MemoryRouter><RealtimeProvider><FilesPage /></RealtimeProvider></MemoryRouter>);

    expect(await screen.findByText(file.fileName)).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Imagem')).toBeInTheDocument();
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir conversa' })).toHaveAttribute(
      'href',
      `/conversas?period=all&selected=${file.negotiationId}`,
    );
    expect(screen.getByRole('link', { name: 'Abrir negociação' })).toHaveAttribute(
      'href',
      `/pipeline/${file.negotiationId}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Documentos' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/files?fileType=document',
      expect.objectContaining({ credentials: 'include' }),
    ));
    expect(document.body).not.toHaveTextContent('storage/');
  });
});

const contact = {
  id: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
  displayName: 'Contato fictício',
  phoneNumber: '5571000000001',
  tags: [],
  source: 'manual',
  status: 'active',
  notes: null,
  lastInteractionAt: null,
};
const file = {
  messageId: '11b3f58b-4f89-47f2-93bc-89be57028a48',
  contactId: contact.id,
  contactName: contact.displayName,
  negotiationId: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb',
  messageType: 'image',
  direction: 'inbound',
  fileName: 'proposta-ficticia.jpg',
  mimeType: 'image/jpeg',
  fileSizeBytes: '1024',
  durationSeconds: null,
  transcriptionState: 'completed',
  caption: 'Imagem da proposta fictícia',
  occurredAt: '2026-07-29T12:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
