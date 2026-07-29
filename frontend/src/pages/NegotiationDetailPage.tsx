import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback.js';
import { MediaPreview } from '../components/MediaPreview.js';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_FIELD_LABELS,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  PROCESSING_LABELS,
  SENTIMENT_LABELS,
  STAGE_LABELS,
} from '../lib/format.js';
import type { NegotiationDetail, ProductCapabilities } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function NegotiationDetailPage() {
  const { revision } = useRealtime();
  const { id } = useParams();
  const [detail, setDetail] = useState<NegotiationDetail>();
  const [capabilities, setCapabilities] = useState<ProductCapabilities>();
  const [error, setError] = useState<string>();
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string>();
  const [suggestedStage, setSuggestedStage] = useState('');
  const [suggestedTags, setSuggestedTags] = useState('');
  const [suggestedValue, setSuggestedValue] = useState('');
  const [suggestedExpectedCloseDate, setSuggestedExpectedCloseDate] = useState('');
  const [suggestedProductInterest, setSuggestedProductInterest] = useState('');
  const [suggestedNextAction, setSuggestedNextAction] = useState('');
  const [suggestedNextActionDueDate, setSuggestedNextActionDueDate] = useState('');
  const [showCommercialForm, setShowCommercialForm] = useState(false);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialError, setCommercialError] = useState<string>();
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpError, setFollowUpError] = useState<string>();
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(undefined);
    try {
      const [negotiation, currentCapabilities] = await Promise.all([
        api.negotiation(id),
        api.capabilities().catch(() => ({
          demoSimulationEnabled: false,
          audioTranscriptionEnabled: false,
          messageAnalysisEnabled: false,
        })),
      ]);
      setDetail(negotiation);
      setCapabilities(currentCapabilities);
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
    setSuggestedValue('');
    setSuggestedExpectedCloseDate(
      latestAnalysis?.entities?.deadline?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? '',
    );
    setSuggestedProductInterest(latestAnalysis?.entities?.product ?? '');
    setSuggestedNextAction(latestAnalysis?.nextActions[0] ?? '');
    setSuggestedNextActionDueDate(
      latestAnalysis?.entities?.deadline?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? '',
    );
    setDecisionError(undefined);
  }, [latestAnalysis]);

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
        ...(decision === 'accepted' && suggestedValue ? { value: suggestedValue } : {}),
        ...(decision === 'accepted' && suggestedExpectedCloseDate
          ? { expectedCloseDate: suggestedExpectedCloseDate }
          : {}),
        ...(decision === 'accepted' && suggestedProductInterest.trim()
          ? { productInterest: suggestedProductInterest.trim() }
          : {}),
        ...(decision === 'accepted' && suggestedNextAction.trim()
          ? { nextAction: suggestedNextAction.trim() }
          : {}),
        ...(decision === 'accepted' && suggestedNextActionDueDate
          ? { nextActionDueDate: suggestedNextActionDueDate }
          : {}),
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

  const updateCommercial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !detail) return;
    const form = new FormData(event.currentTarget);
    const optional = (name: string) => String(form.get(name) ?? '').trim();
    setCommercialBusy(true);
    setCommercialError(undefined);
    try {
      const title = optional('title');
      const value = optional('value');
      const expectedCloseDate = optional('expectedCloseDate');
      const productInterest = optional('productInterest');
      const nextAction = optional('nextAction');
      const nextActionDueDate = optional('nextActionDueDate');
      await api.updateNegotiation(id, {
        expectedVersion: detail.version,
        title: title || null,
        value: value || null,
        expectedCloseDate: expectedCloseDate || null,
        productInterest: productInterest || null,
        nextAction: nextAction || null,
        nextActionDueDate: nextActionDueDate || null,
      });
      setShowCommercialForm(false);
      await load();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.code === 'version_conflict') {
        setCommercialError('A negociação mudou em outra sessão. Os dados foram recarregados.');
        await load();
      } else {
        setCommercialError('Não foi possível atualizar os dados comerciais. Confira os campos.');
      }
    } finally {
      setCommercialBusy(false);
    }
  };

  const completeNextAction = async () => {
    if (!id || !detail?.nextAction) return;
    if (!window.confirm(`Concluir a próxima ação "${detail.nextAction}"?`)) return;
    setFollowUpBusy(true);
    setFollowUpError(undefined);
    try {
      await api.completeNextAction(id, detail.version);
      await load();
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.code === 'version_conflict') {
        setFollowUpError('A negociação mudou em outra sessão. Os dados foram recarregados.');
        await load();
      } else {
        setFollowUpError('Não foi possível concluir a próxima ação.');
      }
    } finally {
      setFollowUpBusy(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!id || !detail || detail.messagesPage.nextOffset === null) return;
    setLoadingOlderMessages(true);
    try {
      const older = await api.negotiation(id, 'negotiation', {
        limit: detail.messagesPage.limit,
        offset: detail.messagesPage.nextOffset,
      });
      setDetail((current) => current?.id === older.id ? {
        ...current,
        messages: [...older.messages, ...current.messages],
        messagesPage: older.messagesPage,
      } : current);
    } catch {
      setError('Não foi possível carregar as mensagens anteriores.');
    } finally {
      setLoadingOlderMessages(false);
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
          <button className="button secondary" type="button" onClick={() => setShowCommercialForm((value) => !value)}>
            {showCommercialForm ? 'Cancelar edição' : 'Editar dados'}
          </button>
        </div>
      </header>

      {showCommercialForm ? (
        <section className="panel form-panel" aria-labelledby="commercial-form-title">
          <div className="panel-heading"><h2 id="commercial-form-title">Dados comerciais confirmados</h2></div>
          <form className="negotiation-form" key={detail.version} onSubmit={(event) => void updateCommercial(event)}>
            <label>Título<input name="title" maxLength={255} defaultValue={detail.title ?? ''} /></label>
            <label>Valor (R$)<input name="value" type="number" min="0" step="0.01" defaultValue={detail.value ?? ''} /></label>
            <label>Previsão de fechamento<input name="expectedCloseDate" type="date" defaultValue={detail.expectedCloseDate ?? ''} /></label>
            <label>Produto ou interesse<input name="productInterest" maxLength={1_000} defaultValue={detail.productInterest ?? ''} /></label>
            <label className="full-width">Próxima ação<input name="nextAction" maxLength={1_000} defaultValue={detail.nextAction ?? ''} /></label>
            <label>Prazo da próxima ação<input name="nextActionDueDate" type="date" defaultValue={detail.nextActionDueDate ?? ''} /></label>
            {commercialError ? <p className="inline-error full-width" role="alert">{commercialError}</p> : null}
            <div className="full-width form-actions"><button className="button primary" disabled={commercialBusy}>{commercialBusy ? 'Salvando…' : 'Salvar dados'}</button></div>
          </form>
        </section>
      ) : null}

      <section className="panel next-action-panel">
        <div><p className="eyebrow">Acompanhamento</p><h2>Próxima ação</h2></div>
        <div>
          <strong>{detail.nextAction ?? 'Nenhuma próxima ação definida'}</strong>
          <small>{detail.nextActionDueDate ? `Prazo: ${formatDateOnly(detail.nextActionDueDate)}` : 'Sem prazo definido'}</small>
          {detail.nextAction ? <button className="button primary" type="button" disabled={followUpBusy} onClick={() => void completeNextAction()}>{followUpBusy ? 'Concluindo…' : 'Concluir ação'}</button> : null}
          {followUpError ? <span className="inline-error" role="alert">{followUpError}</span> : null}
        </div>
      </section>

      {detail.closeReason ? (
        <section className="panel close-reason"><strong>Motivo do fechamento</strong><p>{detail.closeReason}</p></section>
      ) : null}

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
          {!latestAnalysis ? (
            <EmptyState
              title={capabilities?.messageAnalysisEnabled
                ? 'Ainda sem análise'
                : 'Análise assistiva ainda não ativada'}
              description={capabilities?.messageAnalysisEnabled
                ? 'As sugestões aparecerão após o processamento das mensagens.'
                : 'As mensagens estão preservadas. Nenhum conteúdo está sendo enviado a um provedor de IA.'}
            />
          ) : (
            <div className="analysis-content">
              {!capabilities?.messageAnalysisEnabled ? (
                <p className="muted">O pipeline de novas análises está desativado neste ambiente.</p>
              ) : null}
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
                  <label>Valor confirmado (R$)
                    <input type="number" min="0" step="0.01" value={suggestedValue} onChange={(event) => setSuggestedValue(event.target.value)} placeholder={latestAnalysis.entities?.amount ?? 'Não alterar o valor'} />
                  </label>
                  <label>Previsão confirmada
                    <input type="date" value={suggestedExpectedCloseDate} onChange={(event) => setSuggestedExpectedCloseDate(event.target.value)} />
                  </label>
                  <label>Produto ou interesse confirmado
                    <input maxLength={1_000} value={suggestedProductInterest} onChange={(event) => setSuggestedProductInterest(event.target.value)} placeholder="Não alterar o produto" />
                  </label>
                  <label>Próxima ação confirmada
                    <input maxLength={1_000} value={suggestedNextAction} onChange={(event) => setSuggestedNextAction(event.target.value)} placeholder="Não definir próxima ação" />
                  </label>
                  <label>Prazo da próxima ação
                    <input type="date" value={suggestedNextActionDueDate} onChange={(event) => setSuggestedNextActionDueDate(event.target.value)} />
                  </label>
                  {decisionError ? <p className="inline-error" role="alert">{decisionError}</p> : null}
                  <div className="decision-actions">
                    <button className="button primary" type="button" disabled={decisionBusy || (!suggestedStage && !suggestedTags.trim() && !suggestedValue && !suggestedExpectedCloseDate && !suggestedProductInterest.trim() && !suggestedNextAction.trim() && !suggestedNextActionDueDate)} onClick={() => void decide('accepted')}>
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

      <section className="panel follow-up-history-panel">
        <div className="panel-heading"><div><p className="eyebrow">Acompanhamento</p><h2>Ações concluídas</h2></div><small>Até 50 ações recentes</small></div>
        {detail.followUpHistory.length === 0 ? <EmptyState title="Nenhuma ação concluída" description="As ações concluídas aparecerão aqui sem perder descrição ou prazo." /> : (
          <ol className="follow-up-history">
            {detail.followUpHistory.map((followUp) => (
              <li key={followUp.id}>
                <div><strong>{followUp.description}</strong><small>{followUp.completedByDisplayName} · {formatDateTime(followUp.completedAt)}</small></div>
                <span>{followUp.dueDate ? `Prazo original: ${formatDateOnly(followUp.dueDate)}` : 'Sem prazo original'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel timeline-panel">
        <div className="panel-heading"><div><p className="eyebrow">Conversa</p><h2>Histórico de mensagens</h2></div><small>{detail.messages.length} mensagem(ns) carregada(s)</small></div>
        {detail.messages.length === 0 ? <EmptyState title="Nenhuma mensagem" description="O histórico aparecerá quando a conversa for ingerida." /> : (
          <div className="timeline">
            {detail.messagesPage.hasMore ? (
              <button className="button secondary older-messages" type="button" disabled={loadingOlderMessages} onClick={() => void loadOlderMessages()}>
                {loadingOlderMessages ? 'Carregando…' : 'Carregar mensagens anteriores'}
              </button>
            ) : null}
            {detail.messages.map((message) => (
              <article className={`message ${message.direction}`} key={message.id}>
                <small>{message.direction === 'inbound' ? detail.contact.displayName : 'Você'} · {formatDate(message.occurredAt)}</small>
                <p>{message.content ?? (message.messageType === 'audio' ? 'Mensagem de áudio' : 'Conteúdo indisponível')}</p>
                {message.media ? (
                  <>
                    {message.media.playbackAvailable && isDetailMediaType(message.messageType) ? (
                      <MediaPreview
                        messageId={message.id}
                        messageType={message.messageType}
                        fileName={message.media.fileName ?? 'Arquivo da conversa'}
                      />
                    ) : <p className="media-unavailable">Arquivo indisponível ou removido pela retenção.</p>}
                    {message.media.retentionUntil ? (
                      <small className="retention-note">Disponível até {formatDate(message.media.retentionUntil)}</small>
                    ) : null}
                    {message.messageType === 'audio' ? <div className="transcription">
                      <strong>Transcrição · {PROCESSING_LABELS[message.media.transcriptionState]}</strong>
                      <p>{message.media.transcriptionText ?? (message.media.transcriptionState === 'failed'
                        ? 'Não foi possível transcrever este áudio.'
                        : capabilities?.audioTranscriptionEnabled
                          ? 'Aguardando transcrição.'
                          : 'Transcrição ainda não ativada. O áudio original continua disponível.')}</p>
                    </div> : null}
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

function isDetailMediaType(value: string): value is 'audio' | 'image' | 'document' {
  return value === 'audio' || value === 'image' || value === 'document';
}
