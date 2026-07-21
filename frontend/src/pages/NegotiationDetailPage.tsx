import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback.js';
import { AudioPlayer } from '../components/AudioPlayer.js';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_FIELD_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  PROCESSING_LABELS,
  SENTIMENT_LABELS,
  STAGE_LABELS,
} from '../lib/format.js';
import type { NegotiationDetail } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function NegotiationDetailPage() {
  const { revision } = useRealtime();
  const { id } = useParams();
  const [detail, setDetail] = useState<NegotiationDetail>();
  const [error, setError] = useState<string>();
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string>();
  const [suggestedStage, setSuggestedStage] = useState('');
  const [suggestedTags, setSuggestedTags] = useState('');

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

  useEffect(() => { void load(); }, [load, revision]);

  const latestAnalysis = detail?.analyses[0];
  useEffect(() => {
    setSuggestedStage(latestAnalysis?.suggestedStage ?? '');
    setSuggestedTags(latestAnalysis?.suggestedTags.join(', ') ?? '');
    setDecisionError(undefined);
  }, [latestAnalysis?.id]);

  const decide = async (decision: 'accepted' | 'ignored') => {
    if (!id || !detail || !latestAnalysis) return;
    setDecisionBusy(true);
    setDecisionError(undefined);
    try {
      const tags = suggestedTags.split(',').map((tag) => tag.trim()).filter(Boolean);
      await api.decideAnalysis(id, latestAnalysis.id, {
        decisionId: crypto.randomUUID(),
        decision,
        expectedVersion: detail.version,
        ...(decision === 'accepted' && suggestedStage ? { stage: suggestedStage as typeof detail.stage } : {}),
        ...(decision === 'accepted' && tags.length ? { tags } : {}),
      });
      await load();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && (caught.code === 'version_conflict' || caught.code === 'decision_conflict')) {
        setDecisionError('A negociação ou esta sugestão mudou. Os dados foram recarregados.');
        await load();
      } else if (caught instanceof ApiError && caught.code === 'contact_tag_limit') {
        setDecisionError('O contato atingiria o limite de 20 tags. Edite a seleção e tente novamente.');
      } else {
        setDecisionError('Não foi possível registrar sua decisão. Tente novamente.');
      }
    } finally {
      setDecisionBusy(false);
    }
  };

  if (error && !detail) return <ErrorState message={error} retry={() => void load()} />;
  if (!detail) return <LoadingState label="Carregando negociação…" />;

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
              <small>Análise {PROCESSING_LABELS[latestAnalysis.state]} · {latestAnalysis.modelUsed ?? latestAnalysis.promptVersion}</small>
              {latestAnalysis.state === 'failed' ? <p>Não foi possível analisar esta mensagem. O conteúdo original continua disponível.</p> : <>
                <p>{latestAnalysis.summary ?? 'Resumo ainda não disponível.'}</p>
                {latestAnalysis.sentiment ? <p><strong>Sentimento:</strong> {SENTIMENT_LABELS[latestAnalysis.sentiment]}</p> : null}
                {latestAnalysis.entities && Object.values(latestAnalysis.entities).some(Boolean) ? (
                  <dl className="analysis-entities">
                    {latestAnalysis.entities.product ? <div><dt>Produto</dt><dd>{latestAnalysis.entities.product}</dd></div> : null}
                    {latestAnalysis.entities.amount ? <div><dt>Valor citado</dt><dd>{latestAnalysis.entities.amount}</dd></div> : null}
                    {latestAnalysis.entities.deadline ? <div><dt>Prazo citado</dt><dd>{latestAnalysis.entities.deadline}</dd></div> : null}
                  </dl>
                ) : null}
                {latestAnalysis.suggestedStage ? <p><strong>Etapa sugerida:</strong> {STAGE_LABELS[latestAnalysis.suggestedStage]}</p> : null}
                {latestAnalysis.objections.length ? <div><strong>Objeções identificadas</strong><ul>{latestAnalysis.objections.map((objection) => <li key={objection}>{objection}</li>)}</ul></div> : null}
                {latestAnalysis.nextActions.length ? <div><strong>Próximas ações sugeridas</strong><ul>{latestAnalysis.nextActions.map((action) => <li key={action}>{action}</li>)}</ul></div> : null}
                {latestAnalysis.suggestedTags.length ? <div><strong>Tags sugeridas</strong><div className="tag-list">{latestAnalysis.suggestedTags.map((tag) => <span key={tag}>{tag}</span>)}</div></div> : null}
              </>}
              {latestAnalysis.decision ? (
                <div className="decision-status" role="status">
                  {latestAnalysis.decision.decision === 'accepted'
                    ? 'Sugestão aplicada por confirmação explícita.'
                    : 'Sugestão ignorada por confirmação explícita.'}
                </div>
              ) : latestAnalysis.state === 'completed' ? (
                <div className="decision-form">
                  <label>Etapa a aplicar
                    <select value={suggestedStage} onChange={(event) => setSuggestedStage(event.target.value)}>
                      <option value="">Não alterar a etapa</option>
                      {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Tags a adicionar
                    <input value={suggestedTags} maxLength={1_000} onChange={(event) => setSuggestedTags(event.target.value)} placeholder="Separe as tags por vírgulas" />
                  </label>
                  {decisionError ? <p className="inline-error" role="alert">{decisionError}</p> : null}
                  <div className="decision-actions">
                    <button className="button primary" type="button" disabled={decisionBusy || (!suggestedStage && !suggestedTags.trim())} onClick={() => void decide('accepted')}>
                      {decisionBusy ? 'Registrando…' : 'Aplicar seleção'}
                    </button>
                    <button className="button secondary" type="button" disabled={decisionBusy} onClick={() => void decide('ignored')}>Ignorar sugestão</button>
                  </div>
                </div>
              ) : null}
              <small>A IA apenas sugere; toda aplicação exige confirmação e fica auditada.</small>
            </div>
          )}
        </article>
      </section>

      <section className="panel audit-panel">
        <div className="panel-heading"><div><p className="eyebrow">Auditoria</p><h2>Histórico de atividades</h2></div><small>Até 50 ações recentes</small></div>
        {detail.auditTrail.length === 0 ? (
          <EmptyState title="Nenhuma ação auditada" description="As próximas alterações manuais aparecerão aqui." />
        ) : (
          <ol className="audit-list">
            {detail.auditTrail.map((event) => (
              <li key={event.id}>
                <div><strong>{AUDIT_ACTION_LABELS[event.action]}</strong><small>{event.actorDisplayName} · {formatDateTime(event.createdAt)}</small></div>
                {event.details.previousStage && event.details.resultingStage ? (
                  <span>{STAGE_LABELS[event.details.previousStage]} → {STAGE_LABELS[event.details.resultingStage]}</span>
                ) : event.changedFields.length ? (
                  <span>Campos: {event.changedFields.map((field) => AUDIT_FIELD_LABELS[field] ?? field).join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
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
                  <>
                    <AudioPlayer messageId={message.id} playbackAvailable={message.media.playbackAvailable} />
                    <div className="transcription">
                      <strong>Transcrição · {PROCESSING_LABELS[message.media.transcriptionState]}</strong>
                      <p>{message.media.transcriptionText ?? (message.media.transcriptionState === 'failed'
                        ? 'Não foi possível transcrever este áudio.'
                        : 'Aguardando transcrição.')}</p>
                    </div>
                  </>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
