import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDateTime, STAGE_LABELS } from '../lib/format.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { ConversationSummary, Dashboard } from '../types/api.js';

export function HomePage() {
  const auth = useAuth();
  const { revision } = useRealtime();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const range = todayRange();
    try {
      const [dashboardData, conversationData] = await Promise.all([
        api.dashboard(),
        api.conversations({ startedFrom: range.from, startedTo: range.to }),
      ]);
      setDashboard(dashboardData);
      setConversations(conversationData.data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  if (error && (!dashboard || !conversations)) {
    return <ErrorState message="Não foi possível carregar a Home." retry={() => void load()} />;
  }
  if (!dashboard || !conversations) return <LoadingState label="Preparando sua Home…" />;

  return (
    <div className="page-stack home-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Olá, {auth.user?.displayName.split(' ')[0]}.</h1>
        </div>
        <p>Atalhos e prioridades para começar o dia sem perder o contexto comercial.</p>
      </header>

      <section className="home-priorities" aria-label="Prioridades de hoje">
        <Link to="/conversas?period=today"><span>Conversas iniciadas hoje</span><strong>{conversations.length}</strong><small>Abrir tabela e filtros</small></Link>
        <Link to="/agenda?followUp=today"><span>Tarefas para hoje</span><strong>{dashboard.todayFollowUpsCount}</strong><small>Ver agenda de follow-ups</small></Link>
        <Link to="/agenda?followUp=overdue" className={dashboard.overdueFollowUpsCount ? 'warning' : ''}><span>Tarefas vencidas</span><strong>{dashboard.overdueFollowUpsCount}</strong><small>Priorizar pendências</small></Link>
        <Link to="/controle"><span>Negociações ativas</span><strong>{dashboard.activeNegotiationsCount}</strong><small>Abrir tela de controle</small></Link>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Funções</p><h2>Acesso rápido</h2></div></div>
        <div className="function-grid">
          <Link to="/contatos"><strong>Contatos</strong><span>Cadastrar, editar e localizar pessoas.</span></Link>
          <Link to="/pipeline"><strong>Pipeline</strong><span>Organizar oportunidades por etapa.</span></Link>
          <Link to="/agenda"><strong>Tarefas e agenda</strong><span>Filtrar follow-ups e concluir ações.</span></Link>
          <Link to="/arquivos"><strong>Arquivos por contato</strong><span>Localizar áudios, imagens e documentos.</span></Link>
          <Link to="/conversas"><strong>Conversas</strong><span>Consultar classificação, resumo e histórico.</span></Link>
          <Link to="/whatsapp"><strong>Integração</strong><span>Acompanhar o estado do WhatsApp.</span></Link>
          <Link to="/piloto"><strong>Piloto do cliente</strong><span>Executar o checklist guiado de homologação.</span></Link>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Hoje</p><h2>Conversas recentes</h2></div><Link className="card-link" to="/conversas?period=today">Ver todas</Link></div>
        {conversations.length === 0 ? <p className="muted">Nenhuma conversa foi iniciada hoje.</p> : (
          <div className="compact-table">
            {conversations.slice(0, 5).map((conversation) => (
              <Link key={conversation.negotiationId} to={`/conversas?selected=${conversation.negotiationId}`}>
                <strong>{conversation.contactName}</strong>
                <span>{conversation.latestAnalysis?.suggestedStage
                  ? STAGE_LABELS[conversation.latestAnalysis.suggestedStage]
                  : 'Sem classificação da IA'}</span>
                <small>{formatDateTime(conversation.lastMessage.occurredAt)}</small>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function todayRange(): { from: string; to: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
