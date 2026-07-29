import { useState, type FormEvent } from 'react';

import { ApiError, api } from '../api/client.js';
import type { Negotiation } from '../types/api.js';

interface QuickFollowUpEditorProps {
  negotiationId: string;
  expectedVersion: number;
  initialAction: string | null;
  initialDueDate: string | null;
  onSaved: (negotiation: Negotiation) => void | Promise<void>;
  onCancel: () => void;
}

export function QuickFollowUpEditor({
  negotiationId,
  expectedVersion,
  initialAction,
  initialDueDate,
  onSaved,
  onCancel,
}: QuickFollowUpEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextAction = String(form.get('nextAction') ?? '').trim();
    const nextActionDueDate = String(form.get('nextActionDueDate') ?? '').trim();
    if (!nextAction) {
      setError('Descreva a próxima ação antes de salvar.');
      return;
    }

    setBusy(true);
    setError(undefined);
    let negotiation: Negotiation;
    try {
      negotiation = await api.updateNegotiation(negotiationId, {
        expectedVersion,
        nextAction,
        nextActionDueDate: nextActionDueDate || null,
      });
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'version_conflict'
        ? 'Esta negociação mudou em outra sessão. Atualize os dados e tente novamente.'
        : 'Não foi possível salvar o acompanhamento.');
      setBusy(false);
      return;
    }

    try {
      await onSaved(negotiation);
    } catch {
      setError('O acompanhamento foi salvo, mas a tela não pôde ser atualizada. Recarregue a página.');
    }
    setBusy(false);
  }

  return (
    <form className="quick-follow-up" onSubmit={(event) => void submit(event)}>
      <label>
        Próxima ação
        <input
          name="nextAction"
          maxLength={1_000}
          defaultValue={initialAction ?? ''}
          placeholder="Ex.: Retornar com a proposta revisada"
          autoFocus
        />
      </label>
      <label>
        Prazo
        <input name="nextActionDueDate" type="date" defaultValue={initialDueDate ?? ''} />
      </label>
      <div className="quick-follow-up-actions">
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar acompanhamento'}
        </button>
        <button className="button secondary" type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </form>
  );
}
