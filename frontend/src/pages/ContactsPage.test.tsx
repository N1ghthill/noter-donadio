import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContactsPage } from './ContactsPage.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
}));

const contact = {
  id: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
  displayName: 'Contato fictício',
  phoneNumber: '5571000000000',
  tags: [],
  source: 'manual',
  status: 'active',
  notes: null,
  lastInteractionAt: null,
};

describe('contatos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exige confirmação explícita antes da exclusão irreversível', async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({
        data: deleted ? [] : [contact],
        meta: { limit: 50, offset: 0, hasMore: false, nextOffset: null },
      }), { status: 200 });
    });
    vi.stubGlobal('confirm', confirmMock);
    vi.stubGlobal('fetch', fetchMock);

    render(<RealtimeProvider><ContactsPage /></RealtimeProvider>);
    expect(await screen.findByText('Contato fictício')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/contacts/${contact.id}`,
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ confirmation: contact.id }),
      }),
    ));
    expect(await screen.findByText('Nenhum contato encontrado')).toBeInTheDocument();
    expect(confirmMock).toHaveBeenLastCalledWith(expect.stringContaining('não pode ser desfeita'));
  });
});
