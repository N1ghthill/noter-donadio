import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { QuickFollowUpEditor } from '../components/QuickFollowUpEditor.js';
import { formatDateOnly, STAGE_LABELS } from '../lib/format.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { Negotiation } from '../types/api.js';

type FollowUpFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'missing';

export function AgendaPage() {
  const { revision } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('followUp');
  const [followUp, setFollowUp] = useState<FollowUpFilter>(isFollowUpFilter(requested) ? requested : 'all');
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState((searchParams.get('search') ?? '').trim());
  const [tasks, setTasks] = useState<Negotiation[]>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    setError(undefined);
    try {
      const response = await api.negotiations({
        activeOnly: true,
        ...(followUp !== 'all' ? { followUp } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        limit: 100,
        offset,
      });
      setTasks((current) => append && current
        ? [...current, ...response.data.filter((task) => (
            !current.some((existing) => existing.id === task.id)
          ))]
        : response.data);
      setNextOffset(response.meta.nextOffset);
    } catch {
      setError('Não foi possível carregar a agenda.');
    }
  }, [followUp, search]);

  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (followUp !== 'all') params.set('followUp', followUp);
    if (search) params.set('search', search);
    setSearchParams(params, { replace: true });
  }, [followUp, search, setSearchParams]);

  async function complete(task: Negotiation) {
    if (!task.nextAction || !window.confirm(`Concluir a tarefa "${task.nextAction}"?`)) return;
    setBusyId(task.id);
    setError(undefined);
    try {
      await api.completeNextAction(task.id, task.version);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'version_conflict'
        ? 'A tarefa mudou em outra sessão. A agenda foi atualizada.'
        : 'Não foi possível concluir a tarefa.');
      await load();
    } finally {
      setBusyId(undefined);
    }
  }

  function applyFollowUp(nextFollowUp: FollowUpFilter) {
    setFollowUp(nextFollowUp);
  }

  function clearFilters() {
    setFollowUp('all');
    setSearchDraft('');
    setSearch('');
  }

  async function loadMore(): Promise<void> {
    if (nextOffset === null) return;
    setLoadingMore(true);
    await load(nextOffset, true);
    setLoadingMore(false);
  }

  if (!tasks && error) return <ErrorState message={error} retry={() => void load()} />;
  if (!tasks) return <LoadingState label="Carregando tarefas…" />;

  return (
    <div className="page-stack agenda-page">
      <header className="page-header">
        <div><p className="eyebrow">Agenda</p><h1>Tarefas e follow-ups</h1></div>
        <p>Priorize acompanhamentos, confira o resumo disponível e conclua ações sem perder o histórico.</p>
      </header>
      {error ? <ErrorState message={error} /> : null}

      <section className="panel filter-panel">
        <label>Prazo
          <select value={followUp} onChange={(event) => applyFollowUp(event.target.value as FollowUpFilter)}>
            <option value="all">Todas as negociações ativas</option>
            <option value="overdue">Vencidas</option>
            <option value="today">Para hoje</option>
            <option value="upcoming">Próximas</option>
            <option value="missing">Sem próxima ação</option>
          </select>
        </label>
        <label>Buscar
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Contato, tarefa ou negociação" />
        </label>
        <button className="button-link filter-clear" type="button" onClick={clearFilters}>Limpar filtros</button>
      </section>

      <section className="panel notion-panel">
        <div className="panel-heading"><h2>Agenda operacional</h2><span>{tasks.length} item(ns)</span></div>
        {tasks.length === 0 ? <p className="muted">Nenhuma tarefa corresponde aos filtros.</p> : (
          <div className="notion-table agenda-table">
            <div className="notion-row notion-header"><span>Tarefa</span><span>Contato</span><span>Prazo</span><span>Etapa</span><span>Classificação IA</span><span>Resumo do que aconteceu</span><span>Ações</span></div>
            {tasks.map((task) => (
              <article className="notion-row" key={task.id}>
                <strong>{task.nextAction ?? 'Definir próxima ação'}</strong>
                <span>{task.contactName}</span>
                <span>{task.nextActionDueDate ? formatDateOnly(task.nextActionDueDate) : 'Sem prazo'}</span>
                <span className={`stage-badge stage-${task.stage}`}>{STAGE_LABELS[task.stage]}</span>
                <span>{task.aiSuggestedStage ? STAGE_LABELS[task.aiSuggestedStage] : 'Não classificada'}</span>
                <span className="summary-cell">{task.aiSummary ?? 'Sem resumo produzido pela IA.'}</span>
                <span className="row-actions">
                  <Link to={`/conversas?period=all&selected=${task.id}`}>Conversa</Link>
                  <Link to={`/pipeline/${task.id}`}>Negociação</Link>
                  <button type="button" onClick={() => setEditingId((current) => current === task.id ? undefined : task.id)}>
                    {editingId === task.id ? 'Fechar' : task.nextAction ? 'Reagendar' : 'Definir'}
                  </button>
                  {task.nextAction ? <button type="button" disabled={busyId === task.id} onClick={() => void complete(task)}>{busyId === task.id ? 'Concluindo…' : 'Concluir'}</button> : null}
                </span>
                {editingId === task.id ? (
                  <QuickFollowUpEditor
                    key={`${task.id}-${task.version}`}
                    negotiationId={task.id}
                    expectedVersion={task.version}
                    initialAction={task.nextAction}
                    initialDueDate={task.nextActionDueDate}
                    onCancel={() => setEditingId(undefined)}
                    onSaved={async () => {
                      setEditingId(undefined);
                      await load();
                    }}
                  />
                ) : null}
              </article>
            ))}
          </div>
        )}
        {nextOffset !== null ? (
          <div className="pagination-actions">
            <button className="button secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Carregando…' : 'Carregar mais tarefas'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function isFollowUpFilter(value: string | null): value is FollowUpFilter {
  return value === 'all' || value === 'overdue' || value === 'today'
    || value === 'upcoming' || value === 'missing';
}
