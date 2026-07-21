import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate, formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { Contact, Negotiation } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function DashboardPage() {
  const { revision } = useRealtime();
  const [data, setData] = useState<{ contacts: Contact[]; negotiations: Negotiation[] }>();
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [contacts, negotiations] = await Promise.all([api.contacts(), api.negotiations()]);
      setData({ contacts: contacts.data, negotiations: negotiations.data });
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  if (error) return <ErrorState message="Não foi possível carregar a visão geral." retry={() => void load()} />;
  if (!data) return <LoadingState label="Carregando visão geral…" />;

  const active = data.negotiations.filter(({ stage }) => !stage.startsWith('closed_'));
  const pipelineValue = active.reduce((total, item) => total + Number(item.value ?? 0), 0);
  const recent = [...data.negotiations]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Visão geral</p><h1>Seu comercial, em foco.</h1></div>
        <p>Acompanhe contatos e oportunidades sem perder o contexto das conversas.</p>
      </header>

      <section className="metric-grid" aria-label="Indicadores">
        <article className="metric-card"><span>Contatos</span><strong>{data.contacts.length}</strong><small>na base atual</small></article>
        <article className="metric-card"><span>Negociações ativas</span><strong>{active.length}</strong><small>em andamento</small></article>
        <article className="metric-card accent"><span>Valor no pipeline</span><strong>{formatMoney(String(pipelineValue))}</strong><small>oportunidades abertas</small></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Atividade</p><h2>Negociações recentes</h2></div></div>
        {recent.length === 0 ? <p className="muted">As negociações aparecerão aqui quando forem criadas.</p> : (
          <div className="list-table">
            {recent.map((item) => (
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
