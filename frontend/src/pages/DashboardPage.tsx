import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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

  if (error) return <ErrorState message="Não foi possível carregar a tela de controle." retry={() => void load()} />;
  if (!data) return <LoadingState label="Carregando controle…" />;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Controle</p><h1>Central de controle</h1></div>
        <label className="period-filter">Período de conversão
          <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value) as 30 | 90 | 365)}>
            <option value={30}>30 dias</option><option value={90}>90 dias</option><option value={365}>12 meses</option>
          </select>
        </label>
      </header>

      <section className="metric-grid" aria-label="Indicadores">
        <Link className="metric-card" to="/contatos"><span>Contatos</span><strong>{data.contactsCount}</strong><small>Abrir base de contatos →</small></Link>
        <Link className="metric-card" to="/pipeline?activeOnly=true"><span>Negociações ativas</span><strong>{data.activeNegotiationsCount}</strong><small>Ver oportunidades em andamento →</small></Link>
        <Link className="metric-card accent" to="/pipeline?activeOnly=true"><span>Valor no pipeline</span><strong>{formatMoney(data.pipelineValue)}</strong><small>Abrir oportunidades abertas →</small></Link>
        <Link className="metric-card warning" to="/agenda?followUp=overdue"><span>Ações vencidas</span><strong>{data.overdueFollowUpsCount}</strong><small>{data.todayFollowUpsCount} vencem hoje · priorizar →</small></Link>
        <Link className="metric-card" to="/agenda?followUp=missing"><span>Sem próxima ação</span><strong>{data.missingFollowUpsCount}</strong><small>Organizar negociações sem tarefa →</small></Link>
        <Link className="metric-card" to="/pipeline?stage=closed_won"><span>Taxa de ganho</span><strong>{data.winRatePercent === null ? '—' : `${data.winRatePercent}%`}</strong><small>{data.wonCount} ganhas · {data.lostCount} perdidas →</small></Link>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Resultado do período</p><h2>Entrada e conversão</h2></div><small>Últimos {data.periodDays} dias</small></div>
        <div className="report-grid">
          <Link to="/contatos"><span>Novos contatos</span><strong>{data.newContactsCount}</strong><small>Abrir contatos adicionados</small></Link>
          <Link to="/pipeline"><span>Novas negociações</span><strong>{data.createdNegotiationsCount}</strong><small>Abrir pipeline</small></Link>
          <Link to="/pipeline?stage=closed_won"><span>Valor ganho</span><strong>{formatMoney(data.wonValue)}</strong><small>Ver negociações ganhas</small></Link>
          <Link to="/pipeline?stage=closed_won"><span>Ticket médio ganho</span><strong>{formatMoney(data.averageWonValue)}</strong><small>Consultar negócios com valor</small></Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Distribuição</p><h2>Pipeline por etapa</h2></div></div>
        {data.stages.length === 0 ? <p className="muted">Ainda não há negociações para consolidar.</p> : (
          <div className="stage-summary">
            {data.stages.map((item) => <Link to={`/pipeline?stage=${item.stage}`} key={item.stage}>
              <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
              <strong>{item.count}</strong><small>{formatMoney(item.value)}</small>
            </Link>)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Atividade</p><h2>Negociações recentes</h2></div></div>
        {data.recentNegotiations.length === 0 ? <p className="muted">As negociações aparecerão aqui quando forem criadas.</p> : (
          <div className="list-table">
            {data.recentNegotiations.map((item) => (
              <Link className="list-row" to={`/pipeline/${item.id}`} key={item.id}>
                <div><strong>{item.title ?? item.contactName}</strong><small>{item.contactName}</small></div>
                <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
                <span>{formatMoney(item.value, item.currency)}</span>
                <small>{formatDate(item.updatedAt)}</small>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
