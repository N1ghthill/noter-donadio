import { NEGOTIATION_STAGES, type NegotiationStage } from '@noter/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDateOnly, formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { Contact, Negotiation } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function PipelinePage() {
  const { revision } = useRealtime();
  const [items, setItems] = useState<Negotiation[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string>();
  const [updatingId, setUpdatingId] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [negotiations, contactList] = await Promise.all([api.negotiations(), api.contacts()]);
      setItems(negotiations.data);
      setContacts(contactList.data);
    }
    catch { setError('Não foi possível carregar o pipeline.'); }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const optional = (name: string) => String(form.get(name) ?? '').trim();
    setSaving(true);
    setError(undefined);
    try {
      const title = optional('title');
      const value = optional('value');
      const expectedCloseDate = optional('expectedCloseDate');
      const productInterest = optional('productInterest');
      const nextAction = optional('nextAction');
      const nextActionDueDate = optional('nextActionDueDate');
      await api.createNegotiation({
        contactId: String(form.get('contactId')),
        stage: String(form.get('stage')) as NegotiationStage,
        ...(title ? { title } : {}),
        ...(value ? { value } : {}),
        ...(expectedCloseDate ? { expectedCloseDate } : {}),
        ...(productInterest ? { productInterest } : {}),
        ...(nextAction ? { nextAction } : {}),
        ...(nextActionDueDate ? { nextActionDueDate } : {}),
      });
      formElement.reset();
      setShowForm(false);
      await load();
    } catch {
      setError('Não foi possível criar a negociação. Confira os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function move(id: string, stage: NegotiationStage) {
    const currentItems = items;
    const current = currentItems?.find((item) => item.id === id);
    if (!currentItems || !current || current.stage === stage || updatingId) return;
    const snapshot = currentItems;
    setItems(currentItems.map((item) => item.id === id ? { ...item, stage, version: item.version + 1 } : item));
    setUpdatingId(id);
    setError(undefined);
    try {
      const updated = await api.updateNegotiationStage(id, { stage, expectedVersion: current.version });
      setItems((list) => list?.map((item) => item.id === id ? updated : item));
    } catch (caught: unknown) {
      setItems(snapshot);
      setError(caught instanceof ApiError && caught.status === 409
        ? 'A negociação foi alterada em outra sessão. O pipeline foi atualizado.'
        : 'Não foi possível mover a negociação. A alteração foi desfeita.');
      if (caught instanceof ApiError && caught.status === 409) await load();
    } finally {
      setUpdatingId(undefined);
    }
  }

  if ((!items || !contacts) && !error) return <LoadingState label="Carregando pipeline…" />;
  if (!items) return <ErrorState message={error ?? 'Não foi possível carregar o pipeline.'} retry={() => void load()} />;

  return (
    <div className="page-stack pipeline-page">
      <header className="page-header compact">
        <div><p className="eyebrow">Oportunidades</p><h1>Pipeline</h1></div>
        <button className="button primary" type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Cancelar' : 'Nova negociação'}
        </button>
      </header>
      {showForm ? (
        <section className="panel form-panel" aria-labelledby="negotiation-form-title">
          <div className="panel-heading"><h2 id="negotiation-form-title">Criar negociação</h2></div>
          {contacts?.length === 0 ? <p className="muted">Cadastre um contato antes de criar uma negociação.</p> : null}
          <form className="negotiation-form" onSubmit={(event) => void create(event)}>
            <label>Contato
              <select name="contactId" required defaultValue="" disabled={contacts?.length === 0}>
                <option value="" disabled>Selecione um contato</option>
                {contacts?.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
              </select>
            </label>
            <label>Título<input name="title" maxLength={160} placeholder="Ex.: Projeto comercial" /></label>
            <label>Etapa
              <select name="stage" defaultValue="lead">
                {NEGOTIATION_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
              </select>
            </label>
            <label>Valor estimado (R$)<input name="value" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" /></label>
            <label>Previsão de fechamento<input name="expectedCloseDate" type="date" /></label>
            <label>Produto ou interesse<input name="productInterest" maxLength={160} /></label>
            <label className="full-width">Próxima ação<input name="nextAction" maxLength={1_000} placeholder="Ex.: Retornar com a proposta revisada" /></label>
            <label>Prazo da próxima ação<input name="nextActionDueDate" type="date" /></label>
            <div className="full-width form-actions">
              <button className="button primary" disabled={saving || contacts?.length === 0}>{saving ? 'Salvando…' : 'Salvar negociação'}</button>
            </div>
          </form>
        </section>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <section className="kanban" aria-label="Pipeline de negociações">
        {NEGOTIATION_STAGES.map((stage) => {
          const stageItems = items.filter((item) => item.stage === stage);
          return (
            <div className="kanban-column" key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) void move(draggedId, stage); setDraggedId(undefined); }}>
              <header><span className={`stage-dot stage-${stage}`} /><h2>{STAGE_LABELS[stage]}</h2><strong>{stageItems.length}</strong></header>
              <div className="kanban-list">
                {stageItems.map((item) => (
                  <article className={`deal-card${updatingId === item.id ? ' updating' : ''}`} key={item.id} draggable={updatingId !== item.id} onDragStart={() => setDraggedId(item.id)} onDragEnd={() => setDraggedId(undefined)}>
                    <small>{item.contactName}</small>
                    <h3>{item.title ?? 'Negociação sem título'}</h3>
                    <strong>{formatMoney(item.value, item.currency)}</strong>
                    {item.nextAction ? (
                      <div className={`next-action ${nextActionState(item.nextActionDueDate)}`}>
                        <span>{item.nextAction}</span>
                        <small>{nextActionLabel(item.nextActionDueDate)}</small>
                      </div>
                    ) : null}
                    {item.sentiment ? <span className="sentiment">{item.sentiment}</span> : null}
                    <label className="stage-select">
                      <span>Etapa</span>
                      <select value={item.stage} disabled={updatingId === item.id} onChange={(event) => void move(item.id, event.target.value as NegotiationStage)}>
                        {NEGOTIATION_STAGES.map((option) => <option key={option} value={option}>{STAGE_LABELS[option]}</option>)}
                      </select>
                    </label>
                    <Link className="card-link" to={`/pipeline/${item.id}`}>Abrir detalhes</Link>
                  </article>
                ))}
                {stageItems.length === 0 ? <p className="column-empty">Solte uma negociação aqui</p> : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function localIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function nextActionState(dueDate: string | null): 'overdue' | 'today' | 'scheduled' | 'unscheduled' {
  if (!dueDate) return 'unscheduled';
  const today = localIsoDate();
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'scheduled';
}

function nextActionLabel(dueDate: string | null): string {
  const state = nextActionState(dueDate);
  if (state === 'overdue') return `Vencida · ${formatDateOnly(dueDate)}`;
  if (state === 'today') return 'Vence hoje';
  if (state === 'scheduled') return `Prazo · ${formatDateOnly(dueDate)}`;
  return 'Sem prazo definido';
}
