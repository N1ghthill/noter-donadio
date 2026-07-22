import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate, formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { Dashboard } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function DashboardPage() {
  const { revision } = useRealtime();
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(30);
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api.dashboard(periodDays));
    } catch {
      setError(true);
    }
  }, [periodDays]);

  useEffect(() => { void load(); }, [load, revision]);

  if (error) return <ErrorState message="Não foi possível carregar a visão geral." retry={() => void load()} />;
  if (!data) return <LoadingState label="Carregando visão geral…" />;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Visão geral</p><h1>Seu comercial, em foco.</h1></div>
        <label className="period-filter">Período de conversão
          <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value) as 30 | 90 | 365)}>
            <option value={30}>30 dias</option><option value={90}>90 dias</option><option value={365}>12 meses</option>
          </select>
        </label>
      </header>

      <section className="metric-grid" aria-label="Indicadores">
        <article className="metric-card"><span>Contatos</span><strong>{data.contactsCount}</strong><small>na base atual</small></article>
        <article className="metric-card"><span>Negociações ativas</span><strong>{data.activeNegotiationsCount}</strong><small>em andamento</small></article>
        <article className="metric-card accent"><span>Valor no pipeline</span><strong>{formatMoney(data.pipelineValue)}</strong><small>oportunidades abertas</small></article>
        <article className="metric-card warning"><span>Ações vencidas</span><strong>{data.overdueFollowUpsCount}</strong><small>{data.todayFollowUpsCount} vencem hoje</small></article>
        <article className="metric-card"><span>Sem próxima ação</span><strong>{data.missingFollowUpsCount}</strong><small>negociações ativas</small></article>
        <article className="metric-card"><span>Taxa de ganho</span><strong>{data.winRatePercent === null ? '—' : `${data.winRatePercent}%`}</strong><small>{data.wonCount} ganhas · {data.lostCount} perdidas</small></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Distribuição</p><h2>Pipeline por etapa</h2></div></div>
        {data.stages.length === 0 ? <p className="muted">Ainda não há negociações para consolidar.</p> : (
          <div className="stage-summary">
            {data.stages.map((item) => <article key={item.stage}>
              <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
              <strong>{item.count}</strong><small>{formatMoney(item.value)}</small>
            </article>)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Atividade</p><h2>Negociações recentes</h2></div></div>
        {data.recentNegotiations.length === 0 ? <p className="muted">As negociações aparecerão aqui quando forem criadas.</p> : (
          <div className="list-table">
            {data.recentNegotiations.map((item) => (
              <article className="list-row" key={item.id}>
                <div><strong>{item.title ?? item.contactName}</strong><small>{item.contactName}</small></div>
                <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
                <span>{formatMoney(item.value, item.currency)}</span>
                <small>{formatDate(item.updatedAt)}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
