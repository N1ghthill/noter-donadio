import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilesPage } from './FilesPage.js';

describe('arquivos por contato', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista mídia sem expor chave interna e oferece o contexto comercial', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/contacts') return response({ data: [contact] });
      if (url === '/api/files') return response({ data: [file] });
      return response({ error: 'not_found' }, 404);
    }));

    render(<MemoryRouter><FilesPage /></MemoryRouter>);

    expect(await screen.findByText(file.fileName)).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir negociação' })).toHaveAttribute(
      'href',
      `/pipeline/${file.negotiationId}`,
    );
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
  fileName: 'audio-2026-07-29.ogg',
  mimeType: 'audio/ogg',
  fileSizeBytes: '1024',
  durationSeconds: 3,
  transcriptionState: 'pending',
  occurredAt: '2026-07-29T12:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
