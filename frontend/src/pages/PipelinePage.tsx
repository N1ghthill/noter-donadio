import { isActiveNegotiation, NEGOTIATION_STAGES, type NegotiationStage } from '@noter/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDateOnly, formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { Contact, Negotiation } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function PipelinePage() {
  const { revision } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Negotiation[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const [showForm, setShowForm] = useState(false);
  const initialSearch = (searchParams.get('search') ?? '').trim();
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [stageFilter, setStageFilter] = useState<NegotiationStage | ''>(pipelineStageFrom(searchParams.get('stage')));
  const [followUpFilter, setFollowUpFilter] = useState<'overdue' | 'today' | 'upcoming' | 'missing' | ''>(followUpFrom(searchParams.get('followUp')));
  const [activeOnly, setActiveOnly] = useState(searchParams.get('activeOnly') === 'true');
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string>();
  const [updatingId, setUpdatingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreContactsAvailable, setMoreContactsAvailable] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [searchingContacts, setSearchingContacts] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    setError(undefined);
    try {
      const [negotiations, contactList] = await Promise.all([
        api.negotiations({
          ...(stageFilter ? { stage: stageFilter } : {}),
          ...(followUpFilter ? { followUp: followUpFilter } : {}),
          ...(activeOnly ? { activeOnly: true } : {}),
          ...(appliedSearch ? { search: appliedSearch } : {}),
          limit: 100,
          offset,
        }),
        api.contacts(undefined, { limit: 100 }),
      ]);
      setItems((current) => append && current
        ? [...current, ...negotiations.data.filter((item) => (
            !current.some((existing) => existing.id === item.id)
          ))]
        : negotiations.data);
      setNextOffset(negotiations.meta.nextOffset);
      setContacts(contactList.data);
      setMoreContactsAvailable(contactList.meta.hasMore);
    }
    catch { setError('Não foi possível carregar o pipeline.'); }
  }, [activeOnly, appliedSearch, followUpFilter, stageFilter]);

  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (stageFilter) params.set('stage', stageFilter);
    if (followUpFilter) params.set('followUp', followUpFilter);
    if (activeOnly) params.set('activeOnly', 'true');
    if (appliedSearch) params.set('search', appliedSearch);
    setSearchParams(params, { replace: true });
  }, [activeOnly, appliedSearch, followUpFilter, setSearchParams, stageFilter]);

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

  async function searchContacts(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSearchingContacts(true);
    setError(undefined);
    try {
      const response = await api.contacts(contactSearch.trim() || undefined, { limit: 100 });
      setContacts(response.data);
      setMoreContactsAvailable(response.meta.hasMore);
    } catch {
      setError('Não foi possível buscar os contatos.');
    } finally {
      setSearchingContacts(false);
    }
  }

  async function move(id: string, stage: NegotiationStage) {
    const currentItems = items;
    const current = currentItems?.find((item) => item.id === id);
    if (!currentItems || !current || current.stage === stage || updatingId) return;
    const closing = stage === 'closed_won' || stage === 'closed_lost';
    let closeReason: string | undefined;
    if (closing) {
      const answer = window.prompt(`Informe o motivo para marcar como ${STAGE_LABELS[stage].toLowerCase()}:`);
      if (answer === null) return;
      closeReason = answer.trim();
      if (!closeReason) {
        setError('O motivo do fechamento é obrigatório.');
        return;
      }
    }
    const snapshot = currentItems;
    setItems(currentItems.map((item) => item.id === id ? { ...item, stage, version: item.version + 1 } : item));
    setUpdatingId(id);
    setError(undefined);
    try {
      const updated = await api.updateNegotiationStage(id, {
        stage,
        expectedVersion: current.version,
        ...(closeReason ? { closeReason } : {}),
      });
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

  async function loadMore(): Promise<void> {
    if (nextOffset === null) return;
    setLoadingMore(true);
    await load(nextOffset, true);
    setLoadingMore(false);
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
          <form className="search-bar contact-picker-search" onSubmit={(event) => void searchContacts(event)}>
            <label className="visually-hidden" htmlFor="pipeline-contact-search">Buscar contato para a negociação</label>
            <input
              id="pipeline-contact-search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Buscar contato por nome ou telefone"
            />
            <button className="button secondary" type="submit" disabled={searchingContacts}>
              {searchingContacts ? 'Buscando…' : 'Buscar contato'}
            </button>
          </form>
          {moreContactsAvailable ? <p className="muted">Há mais resultados. Refine a busca para localizar o contato desejado.</p> : null}
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
      <section className="panel pipeline-filters" aria-label="Filtros do pipeline">
        <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
          <label>Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contato, título, produto ou próxima ação" /></label>
          <label>Etapa
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as NegotiationStage | '')}>
              <option value="">Todas</option>
              {NEGOTIATION_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <label>Acompanhamento
            <select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as typeof followUpFilter)}>
              <option value="">Todos</option>
              <option value="overdue">Vencidas</option>
              <option value="today">Vencem hoje</option>
              <option value="upcoming">Futuras</option>
              <option value="missing">Sem próxima ação</option>
            </select>
          </label>
          <label>Escopo
            <select value={activeOnly ? 'active' : 'all'} onChange={(event) => setActiveOnly(event.target.value === 'active')}>
              <option value="all">Todas as negociações</option>
              <option value="active">Somente ativas</option>
            </select>
          </label>
          <div className="filter-actions">
            <button className="button secondary" type="submit">Aplicar</button>
            <button className="button-link" type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setStageFilter(''); setFollowUpFilter(''); setActiveOnly(false); }}>Limpar</button>
          </div>
        </form>
      </section>
      {error ? <ErrorState message={error} /> : null}
      <section className="kanban" aria-label="Pipeline de negociações">
        {NEGOTIATION_STAGES.filter((stage) => (
          (!activeOnly || isActiveNegotiation(stage)) && (!stageFilter || stage === stageFilter)
        )).map((stage) => {
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
      {nextOffset !== null ? (
        <div className="pagination-actions">
          <button className="button secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Carregando…' : 'Carregar mais negociações'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function pipelineStageFrom(value: string | null): NegotiationStage | '' {
  return NEGOTIATION_STAGES.includes(value as NegotiationStage) ? value as NegotiationStage : '';
}

function followUpFrom(value: string | null): 'overdue' | 'today' | 'upcoming' | 'missing' | '' {
  return value === 'overdue' || value === 'today' || value === 'upcoming' || value === 'missing'
    ? value
    : '';
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
