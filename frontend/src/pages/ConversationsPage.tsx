import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { NegotiationStage } from '@noter/contracts';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { MediaPreview } from '../components/MediaPreview.js';
import { QuickFollowUpEditor } from '../components/QuickFollowUpEditor.js';
import { formatDate, formatDateOnly, PROCESSING_LABELS, STAGE_LABELS } from '../lib/format.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

const INTERACTION_LABELS = {
  new_lead: 'Novo lead',
  new_case: 'Novo assunto',
  continuation: 'Continuação',
  follow_up_response: 'Devolutiva',
  multiple_cases: 'Vários assuntos',
  unclear: 'Revisar vínculo',
} as const;
import type {
  ConversationSummary,
  NegotiationDetail,
  ProductCapabilities,
} from '../types/api.js';

export function ConversationsPage() {
  const { revision } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPeriod = searchParams.get('period');
  const contactId = searchParams.get('contactId') ?? '';
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const [selectedId, setSelectedId] = useState<string | undefined>(searchParams.get('selected') ?? undefined);
  const [period, setPeriod] = useState<ConversationPeriod>(
    isConversationPeriod(requestedPeriod) ? requestedPeriod : 'today',
  );
  const [stage, setStage] = useState<NegotiationStage | ''>(stageFrom(searchParams.get('stage')));
  const [aiStage, setAiStage] = useState<NegotiationStage | ''>(stageFrom(searchParams.get('aiStage')));
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState((searchParams.get('search') ?? '').trim());
  const [detail, setDetail] = useState<NegotiationDetail>();
  const [capabilities, setCapabilities] = useState<ProductCapabilities>();
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [content, setContent] = useState('Olá! Esta é uma nova mensagem simulada para validar a caixa de entrada.');
  const [busy, setBusy] = useState<'text' | 'audio'>();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string>();

  const loadConversations = useCallback(async (offset = 0, append = false) => {
    try {
      const range = conversationRange(period);
      const response = await api.conversations({
        ...range,
        ...(stage ? { stage } : {}),
        ...(aiStage ? { aiStage } : {}),
        ...(contactId ? { contactId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        limit: 50,
        offset,
      });
      setConversations((current) => append && current
        ? [...current, ...response.data.filter((item) => (
            !current.some((existing) => existing.negotiationId === item.negotiationId)
          ))]
        : response.data);
      setNextOffset(response.meta.nextOffset);
      setError(undefined);
      if (!append) {
        setSelectedId((current) => response.data.some((item) => item.negotiationId === current)
          ? current
          : response.data[0]?.negotiationId);
      }
    } catch {
      setError('Não foi possível carregar as conversas.');
    }
  }, [aiStage, contactId, period, search, stage]);

  useEffect(() => { void loadConversations(); }, [loadConversations, revision]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    if (stage) params.set('stage', stage);
    if (aiStage) params.set('aiStage', aiStage);
    if (contactId) params.set('contactId', contactId);
    if (search) params.set('search', search);
    if (selectedId) params.set('selected', selectedId);
    setSearchParams(params, { replace: true });
  }, [aiStage, contactId, period, search, selectedId, setSearchParams, stage]);
  useEffect(() => {
    void api.capabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities({
        demoSimulationEnabled: false,
        audioTranscriptionEnabled: false,
        messageAnalysisEnabled: false,
      }));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    let active = true;
    setDetail(undefined);
    void api.negotiation(selectedId, 'contact')
      .then((response) => { if (active) setDetail(response); })
      .catch(() => { if (active) setError('Não foi possível abrir esta conversa.'); });
    return () => { active = false; };
  }, [selectedId, revision]);

  async function simulateInbound(event: FormEvent) {
    event.preventDefault();
    const message = content.trim();
    if (!message) return;
    await simulateMessage('text', message);
  }

  function selectConversation(negotiationId: string) {
    setSelectedId(negotiationId);
    setEditingFollowUp(false);
  }

  function clearFilters() {
    setPeriod('today');
    setStage('');
    setAiStage('');
    setSearchDraft('');
    setSearch('');
  }

  async function loadMore(): Promise<void> {
    if (nextOffset === null) return;
    setLoadingMore(true);
    await loadConversations(nextOffset, true);
    setLoadingMore(false);
  }

  async function loadOlderMessages(): Promise<void> {
    if (!detail || detail.messagesPage.nextOffset === null) return;
    setLoadingOlder(true);
    try {
      const older = await api.negotiation(detail.id, 'contact', {
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
      setLoadingOlder(false);
    }
  }

  async function simulateMessage(messageType: 'text' | 'audio', message?: string) {
    setBusy(messageType);
    setError(undefined);
    try {
      const result = await api.simulateInboundMessage({
        clientMessageId: globalThis.crypto.randomUUID(),
        messageType,
        ...(message ? { content: message } : {}),
      });
      setSelectedId(result.negotiationId);
      if (messageType === 'text') setContent('');
      await loadConversations();
      setDetail(await api.negotiation(result.negotiationId, 'contact'));
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'whatsapp_not_connected'
        ? 'Conecte primeiro o WhatsApp no modo de demonstração.'
        : 'Não foi possível simular o recebimento da mensagem.');
    } finally {
      setBusy(undefined);
    }
  }

  if (!conversations && error) return <ErrorState message={error} retry={() => void loadConversations()} />;
  if (!conversations) return <LoadingState label="Carregando conversas…" />;

  return (
    <div className="page-stack conversations-page">
      <header className="page-header">
        <div><p className="eyebrow">Atendimento</p><h1>Conversas</h1></div>
        <p>Consulte as mensagens preservadas e acompanhe cada conversa dentro da negociação correspondente.</p>
      </header>
      {error ? <ErrorState message={error} /> : null}

      {capabilities?.demoSimulationEnabled ? <aside className="demo-notice">
        <strong>Entrada simulada</strong>
        <form className="demo-message-form" onSubmit={(event) => void simulateInbound(event)}>
          <label>
            Mensagem fictícia recebida
            <textarea value={content} maxLength={2000} rows={2} onChange={(event) => setContent(event.target.value)} />
          </label>
          <div className="demo-message-actions">
            <button className="button secondary" type="submit" disabled={Boolean(busy) || !content.trim()}>
              {busy === 'text' ? 'Recebendo…' : 'Simular mensagem de texto'}
            </button>
            <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void simulateMessage('audio')}>
              {busy === 'audio' ? 'Processando áudio…' : 'Simular áudio recebido'}
            </button>
          </div>
        </form>
        <small>Nada é enviado ao WhatsApp. A ação exercita apenas o fluxo local de ingestão.</small>
      </aside> : null}

      <section className="panel filter-panel conversation-filters">
        <label>Início da conversa
          <select value={period} onChange={(event) => setPeriod(event.target.value as ConversationPeriod)}>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Todo o período</option>
          </select>
        </label>
        <label>Etapa atual
          <select value={stage} onChange={(event) => setStage(event.target.value as NegotiationStage | '')}>
            <option value="">Todas</option>
            {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Classificação da IA
          <select value={aiStage} onChange={(event) => setAiStage(event.target.value as NegotiationStage | '')}>
            <option value="">Todas</option>
            {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Buscar
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Contato ou negociação" />
        </label>
        <button className="button-link filter-clear" type="button" onClick={clearFilters}>Limpar filtros</button>
      </section>

      <section className="panel notion-panel">
        <div className="panel-heading"><div><p className="eyebrow">Base de conversas</p><h2>Conversas iniciadas</h2></div><span>{conversations.length} conversa(s)</span></div>
        {conversations.length === 0 ? <p className="muted">Nenhuma conversa corresponde aos filtros.</p> : (
          <div className="notion-table conversations-table">
            <div className="notion-row notion-header"><span>Contato</span><span>Iniciada</span><span>Última atividade</span><span>Mensagens</span><span>Etapa atual</span><span>Classificação IA</span><span>Resumo do que aconteceu</span></div>
            {conversations.map((item) => (
              <button
                type="button"
                key={item.negotiationId}
                className={`notion-row${selectedId === item.negotiationId ? ' active' : ''}`}
                onClick={() => selectConversation(item.negotiationId)}
              >
                <span><strong>{item.contactName}</strong><small>{item.title ?? messagePreview(item)}</small></span>
                <time dateTime={item.firstMessageAt}>{formatDate(item.firstMessageAt)}</time>
                <time dateTime={item.lastMessage.occurredAt}>{formatDate(item.lastMessage.occurredAt)}</time>
                <span>{item.messageCount}</span>
                <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
                <span>{item.latestAnalysis?.interactionType
                  ? <>{INTERACTION_LABELS[item.latestAnalysis.interactionType]}{item.latestAnalysis.needsHumanReview ? <small>Conferir vínculo</small> : null}</>
                  : item.latestAnalysis?.suggestedStage
                    ? STAGE_LABELS[item.latestAnalysis.suggestedStage]
                    : 'Não classificada'}</span>
                <span className="summary-cell">{item.latestAnalysis?.summary ?? 'Sem resumo produzido pela IA.'}</span>
              </button>
            ))}
          </div>
        )}
        {nextOffset !== null ? (
          <div className="pagination-actions">
            <button className="button secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Carregando…' : 'Carregar mais conversas'}
            </button>
          </div>
        ) : null}
      </section>

      <article className="panel conversation-detail">
          {!selectedId ? (
            <div className="empty-state"><strong>Nenhuma conversa selecionada</strong><p>Clique em uma linha da tabela para abrir o histórico.</p></div>
          ) : !detail ? <LoadingState label="Abrindo conversa…" /> : (
            <>
              <div className="panel-heading conversation-heading">
                <div><p className="eyebrow">{STAGE_LABELS[detail.stage]}</p><h2>{detail.contactName}</h2></div>
                <div className="conversation-actions">
                  <Link to={`/arquivos?contactId=${detail.contactId}`}>Arquivos</Link>
                  <Link to={`/agenda?search=${encodeURIComponent(detail.contactName)}`}>Agenda</Link>
                  <Link to={`/pipeline/${detail.id}`}>Negociação</Link>
                </div>
              </div>
              <section className="conversation-follow-up" aria-label="Acompanhamento da conversa">
                <div>
                  <small>Próximo acompanhamento</small>
                  <strong>{detail.nextAction ?? 'Nenhuma ação definida'}</strong>
                  <span>{detail.nextActionDueDate
                    ? `Prazo: ${formatDateOnly(detail.nextActionDueDate)}`
                    : 'Sem prazo definido'}</span>
                </div>
                <button className="button secondary" type="button" onClick={() => setEditingFollowUp((value) => !value)}>
                  {editingFollowUp ? 'Fechar edição' : detail.nextAction ? 'Reagendar' : 'Criar follow-up'}
                </button>
                {editingFollowUp ? (
                  <QuickFollowUpEditor
                    key={`${detail.id}-${detail.version}`}
                    negotiationId={detail.id}
                    expectedVersion={detail.version}
                    initialAction={detail.nextAction}
                    initialDueDate={detail.nextActionDueDate}
                    onCancel={() => setEditingFollowUp(false)}
                    onSaved={async () => {
                      setEditingFollowUp(false);
                      setDetail(await api.negotiation(detail.id, 'contact'));
                    }}
                  />
                ) : null}
              </section>
              <div className="timeline conversation-timeline">
                {detail.messagesPage.hasMore ? (
                  <button className="button secondary older-messages" type="button" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>
                    {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
                  </button>
                ) : null}
                {detail.messages.map((message) => (
                  <article className={`message ${message.direction}`} key={message.id}>
                    <small>{message.direction === 'inbound' ? 'Recebida' : 'Enviada'} · {formatDate(message.occurredAt)}</small>
                    <p>{message.content ?? messageTypeLabel(message.messageType)}</p>
                    {message.media ? (
                      <>
                        <div className="message-media-heading">
                          <strong>{messageTypeLabel(message.messageType)}</strong>
                          <small>{message.media.fileName ?? 'Nome não informado'}</small>
                        </div>
                        {message.media.retentionUntil ? (
                          <small className="retention-note">
                            Disponível até {formatDate(message.media.retentionUntil)}
                          </small>
                        ) : null}
                        {message.media.playbackAvailable && isSupportedMediaType(message.messageType)
                          ? <MediaPreview
                              messageId={message.id}
                              messageType={message.messageType}
                              fileName={message.media.fileName ?? 'Arquivo da conversa'}
                            />
                          : <p className="media-unavailable">Arquivo indisponível ou removido pela retenção.</p>}
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
            </>
          )}
      </article>
    </div>
  );
}

function messagePreview(conversation: ConversationSummary): string {
  if (conversation.lastMessage.content) return conversation.lastMessage.content;
  return messageTypeLabel(conversation.lastMessage.messageType);
}

function isSupportedMediaType(value: string): value is 'audio' | 'image' | 'document' {
  return value === 'audio' || value === 'image' || value === 'document';
}

function messageTypeLabel(value: string): string {
  if (value === 'audio') return 'Mensagem de áudio';
  if (value === 'image') return 'Imagem';
  if (value === 'document') return 'Documento';
  return 'Conteúdo não textual';
}

type ConversationPeriod = 'today' | '7d' | '30d' | 'all';

function isConversationPeriod(value: string | null): value is ConversationPeriod {
  return value === 'today' || value === '7d' || value === '30d' || value === 'all';
}

function stageFrom(value: string | null): NegotiationStage | '' {
  switch (value) {
    case 'lead':
    case 'qualified':
    case 'proposal_sent':
    case 'in_negotiation':
    case 'closed_won':
    case 'closed_lost':
    case 'on_hold':
      return value;
    default:
      return '';
  }
}

function conversationRange(period: ConversationPeriod): {
  startedFrom?: string;
  startedTo?: string;
} {
  if (period === 'all') return {};
  const to = new Date();
  if (period === 'today') {
    const from = new Date(to);
    from.setHours(0, 0, 0, 0);
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { startedFrom: from.toISOString(), startedTo: tomorrow.toISOString() };
  }
  const from = new Date(to);
  from.setDate(from.getDate() - (period === '7d' ? 7 : 30));
  return { startedFrom: from.toISOString(), startedTo: to.toISOString() };
}
