import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdministrationPage } from './AdministrationPage.js';

const logout = vi.fn();
vi.mock('../auth/AuthContext.js', () => ({
  useAuth: () => ({ status: 'authenticated', user: null, logout }),
}));

describe('administração', () => {
  afterEach(() => { vi.unstubAllGlobals(); logout.mockReset(); });

  it('lista e revoga uma sessão com confirmação explícita', async () => {
    const sessionId = '54eb359b-6fb4-4d51-8c07-8c55ac7efd65';
    const fetchMock = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      const operational = operationalResponse(path);
      if (operational) return operational;
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (path.startsWith('/api/audit-events')) return new Response(JSON.stringify({ data: [{
        id: '36e0bd12-2a5d-40e1-9644-7089e49ae08e', action: 'workspace_exported',
        actorDisplayName: 'Admin fictício', contactId: null, negotiationId: null,
        changedFields: [], previousVersion: null, resultingVersion: null, details: {},
        createdAt: '2026-07-21T12:30:00.000Z',
      }] }), { status: 200 });
      if (path.startsWith('/api/processing-failures')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ data: [{
        id: sessionId, current: false, createdAt: '2026-07-21T10:00:00.000Z',
        lastSeenAt: '2026-07-21T12:00:00.000Z', expiresAt: '2026-07-21T20:00:00.000Z',
      }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    renderAdministration();
    expect(await screen.findByText('Outra sessão')).toBeInTheDocument();
    expect(screen.getByText('Tudo funcionando')).toBeInTheDocument();
    expect(screen.getByText('Conectado e pronto para receber mensagens.')).toBeInTheDocument();
    expect(screen.getByText('Transcrição e análise estão ativas.')).toBeInTheDocument();
    expect(screen.getByText('Alertas ativos e sem falhas.')).toBeInTheDocument();
    expect(screen.getByText(/Respostas automáticas continuam desativadas/)).toBeInTheDocument();
    expect(screen.getByText('Workspace exportado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/auth/sessions/${sessionId}`,
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirmation: sessionId }) }),
    ));
  });

  it('baixa a exportação administrativa com o nome fornecido pelo servidor', async () => {
    const fetchMock = vi.fn().mockImplementation(async (path: string) => {
      const operational = operationalResponse(path);
      if (operational) return operational;
      if (path === '/api/privacy/workspace-export') return new Response('{}', {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="noter-demo-2026-07-21.json"' },
      });
      if (path.startsWith('/api/processing-failures')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:exportacao');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    renderAdministration();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar dados do workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/privacy/workspace-export', { credentials: 'include' },
    ));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:exportacao');
    click.mockRestore();
  });

  it('reprocessa somente após confirmação explícita do envio à OpenAI', async () => {
    const messageId = 'fbdff1c4-5a25-4e24-b694-d5dc6c21f227';
    let retried = false;
    const fetchMock = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      const operational = operationalResponse(path);
      if (operational) return operational;
      if (path === `/api/processing-failures/analysis/${messageId}/retry` && init?.method === 'POST') {
        retried = true;
        return new Response(JSON.stringify({ status: 'queued' }), { status: 202 });
      }
      if (path.startsWith('/api/processing-failures')) return new Response(JSON.stringify({
        data: retried ? [] : [{
          id: '87507894-44d7-4127-a909-89358db1944a', kind: 'analysis', messageId,
          negotiationId: 'db71084e-5829-4a90-8346-5832998294ea', contactName: 'Contato fictício',
          failureCode: 'ANALYSIS_AUTHENTICATION_FAILED', failedAt: '2026-08-02T20:30:00.000Z',
          retryEligible: true,
        }],
      }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);

    renderAdministration();
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/processing-failures/analysis/${messageId}/retry`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirmation: messageId }) }),
    ));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('OpenAI'));
  });
});

function renderAdministration() {
  return render(<MemoryRouter><AdministrationPage /></MemoryRouter>);
}

function operationalResponse(path: string): Response | undefined {
  if (path === '/api/capabilities') return new Response(JSON.stringify({
    demoSimulationEnabled: false,
    audioTranscriptionEnabled: true,
    messageAnalysisEnabled: true,
  }), { status: 200 });
  if (path === '/api/notifications/status') return new Response(JSON.stringify({
    enabled: true,
    channel: 'bark',
    automaticWhatsappRepliesEnabled: false,
    lastInboundMessageAt: '2026-08-10T16:00:00.000Z',
    lastDeliveredAt: '2026-08-10T16:00:12.000Z',
    deliveries: { pending: 0, processing: 0, completed: 2, failed: 0 },
  }), { status: 200 });
  if (path === '/api/whatsapp/connection') return new Response(JSON.stringify({
    accountId: '8c11901a-1495-4bb2-8419-a7bc63143250',
    status: 'connected',
    phoneNumber: null,
    updatedAt: '2026-08-10T16:00:00.000Z',
    qrCode: null,
    adapter: 'baileys',
    canSimulate: false,
  }), { status: 200 });
  return undefined;
}
