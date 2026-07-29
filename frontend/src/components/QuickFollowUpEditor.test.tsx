import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuickFollowUpEditor } from './QuickFollowUpEditor.js';

describe('editor rápido de follow-up', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exige descrição e salva com controle de versão', async () => {
    const fetchMock = vi.fn(async () => response({ ...negotiation, version: 4 }));
    const onSaved = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QuickFollowUpEditor
        negotiationId={negotiation.id}
        expectedVersion={3}
        initialAction={null}
        initialDueDate={null}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Descreva a próxima ação');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Próxima ação'), { target: { value: 'Enviar orçamento' } });
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-08-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/negotiations/${negotiation.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: 3,
          nextAction: 'Enviar orçamento',
          nextActionDueDate: '2026-08-03',
        }),
      }),
    ));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }));
  });

  it('explica o conflito sem sobrescrever dados mais recentes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'version_conflict' }, 409)));

    render(
      <QuickFollowUpEditor
        negotiationId={negotiation.id}
        expectedVersion={3}
        initialAction="Ligar"
        initialDueDate={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('mudou em outra sessão');
  });
});

const negotiation = {
  id: '278b2fa9-b1bf-49a4-8beb-d8fa7020d5bb',
  contactId: '3a3db76b-c51a-4584-ab4b-6d3e70952e44',
  contactName: 'Contato fictício',
  title: 'Projeto',
  stage: 'lead',
  value: null,
  currency: 'BRL',
  sentiment: null,
  aiSummary: null,
  aiSuggestedStage: null,
  aiSuggestedTags: [],
  nextAction: 'Enviar orçamento',
  nextActionDueDate: '2026-08-03',
  version: 3,
  updatedAt: '2026-07-29T12:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
