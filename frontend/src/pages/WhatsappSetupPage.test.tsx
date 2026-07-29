import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RealtimeProvider } from '../realtime/RealtimeContext.js';
import { WhatsappSetupPage } from './WhatsappSetupPage.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('configuração simulada do WhatsApp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gera QR e conclui a leitura simulada', async () => {
    const base = {
      accountId: 'account-1', phoneNumber: null, updatedAt: '2026-07-21T00:00:00.000Z',
      adapter: 'fake', canSimulate: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...base, accountId: null, status: 'disconnected', updatedAt: null, qrCode: null }))
      .mockResolvedValueOnce(response({ ...base, status: 'qr_generated', qrCode: { payload: 'noter-demo:opaque', expiresAt: '2026-07-21T00:05:00.000Z' } }))
      .mockResolvedValueOnce(response({ ...base, status: 'connected', phoneNumber: '5571000000001', qrCode: null }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RealtimeProvider><WhatsappSetupPage /></RealtimeProvider>);
    expect(await screen.findByText('Desconectado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar configuração' }));
    expect(await screen.findByLabelText('QR code de demonstração')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simular leitura do QR' }));
    expect(await screen.findByRole('heading', { name: 'Conexão simulada concluída' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar configuração' })).not.toBeInTheDocument();
    expect(screen.getByText(/Um novo QR só será necessário/)).toBeInTheDocument();
  });

  it('não oferece novo setup quando o Baileys já está conectado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      accountId: 'account-1',
      phoneNumber: '5571000000001',
      updatedAt: '2026-07-29T00:00:00.000Z',
      adapter: 'baileys',
      canSimulate: false,
      status: 'connected',
      qrCode: null,
    })));

    render(<RealtimeProvider><WhatsappSetupPage /></RealtimeProvider>);

    expect(await screen.findByRole('heading', { name: 'WhatsApp conectado' })).toBeInTheDocument();
    expect(screen.getByText(/mensagens de texto e áudio/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configuração|QR/i })).not.toBeInTheDocument();
  });

  it('prepara troca de número sem apagar dados do CRM e somente após confirmação', async () => {
    const oldConnection = {
      accountId: '2f31a180-6127-48cd-82da-7b324e49a31d',
      phoneNumber: '5571000000001',
      updatedAt: '2026-07-29T00:00:00.000Z',
      adapter: 'baileys',
      canSimulate: false,
      status: 'disconnected',
      qrCode: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(oldConnection))
      .mockResolvedValueOnce(response({ ...oldConnection, phoneNumber: null }));
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', confirmMock);

    render(<RealtimeProvider><WhatsappSetupPage /></RealtimeProvider>);
    const replace = await screen.findByRole('button', { name: 'Preparar troca de número' });
    expect(screen.queryByRole('button', { name: 'Iniciar configuração' })).not.toBeInTheDocument();

    fireEvent.click(replace);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(replace);

    expect(await screen.findByRole('status')).toHaveTextContent(/Gere o QR somente quando/);
    expect(screen.getByRole('button', { name: 'Iniciar configuração' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/whatsapp/session',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ confirmation: oldConnection.accountId }),
      }),
    ));
    expect(confirmMock).toHaveBeenLastCalledWith(expect.stringContaining('mensagens e áudios permanecerão'));
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
