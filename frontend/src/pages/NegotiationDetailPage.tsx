import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate, formatMoney, STAGE_LABELS } from '../lib/format.js';
import type { NegotiationDetail } from '../types/api.js';

export function NegotiationDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<NegotiationDetail>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) return;
    setError(undefined);
    try {
      setDetail(await api.negotiation(id));
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.status === 404
        ? 'Esta negociação não existe ou não pertence ao seu workspace.'
        : 'Não foi possível carregar a negociação.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error && !detail) return <ErrorState message={error} retry={() => void load()} />;
  if (!detail) return <LoadingState label="Carregando negociação…" />;

  const latestAnalysis = detail.analyses[0];
  return (
    <div className="page-stack detail-page">
      <Link className="back-link" to="/pipeline">← Voltar ao pipeline</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">{detail.contact.displayName}</p>
          <h1>{detail.title ?? 'Negociação sem título'}</h1>
        </div>
        <div className="detail-summary">
          <span className={`stage-badge stage-${detail.stage}`}>{STAGE_LABELS[detail.stage]}</span>
          <strong>{formatMoney(detail.value, detail.currency)}</strong>
        </div>
      </header>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading"><h2>Contato</h2></div>
          <dl className="definition-list">
            <div><dt>Nome</dt><dd>{detail.contact.displayName}</dd></div>
            <div><dt>Telefone</dt><dd><a href={`tel:${detail.contact.phoneNumber}`}>{detail.contact.phoneNumber}</a></dd></div>
            <div><dt>Última interação</dt><dd>{formatDate(detail.contact.lastInteractionAt)}</dd></div>
            <div><dt>Observações</dt><dd>{detail.contact.notes || 'Nenhuma observação.'}</dd></div>
          </dl>
        </article>

        <article className="panel analysis-panel">
          <div className="panel-heading"><div><p className="eyebrow">Assistivo</p><h2>Análise mais recente</h2></div></div>
          {!latestAnalysis ? <EmptyState title="Ainda sem análise" description="As sugestões aparecerão após o processamento das mensagens." /> : (
            <div className="analysis-content">
              <p>{latestAnalysis.summary ?? 'Resumo ainda não disponível.'}</p>
              {latestAnalysis.suggestedStage ? <p><strong>Etapa sugerida:</strong> {STAGE_LABELS[latestAnalysis.suggestedStage]}</p> : null}
              {latestAnalysis.nextActions.length ? <div><strong>Próximas ações sugeridas</strong><ul>{latestAnalysis.nextActions.map((action) => <li key={action}>{action}</li>)}</ul></div> : null}
              <small>Sugestões não são aplicadas automaticamente.</small>
            </div>
          )}
        </article>
      </section>

      <section className="panel timeline-panel">
        <div className="panel-heading"><div><p className="eyebrow">Conversa</p><h2>Histórico de mensagens</h2></div><small>Até 100 mensagens recentes</small></div>
        {detail.messages.length === 0 ? <EmptyState title="Nenhuma mensagem" description="O histórico aparecerá quando a conversa for ingerida." /> : (
          <div className="timeline">
            {detail.messages.map((message) => (
              <article className={`message ${message.direction}`} key={message.id}>
                <small>{message.direction === 'inbound' ? detail.contact.displayName : 'Você'} · {formatDate(message.occurredAt)}</small>
                <p>{message.content ?? (message.messageType === 'audio' ? 'Mensagem de áudio' : 'Conteúdo indisponível')}</p>
                {message.media ? (
                  <div className="transcription">
                    <strong>Transcrição · {message.media.transcriptionState}</strong>
                    <p>{message.media.transcriptionText ?? 'Aguardando transcrição.'}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
