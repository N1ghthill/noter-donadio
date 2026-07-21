import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate, PROCESSING_LABELS, STAGE_LABELS } from '../lib/format.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { ConversationSummary, NegotiationDetail } from '../types/api.js';

export function ConversationsPage() {
  const { revision } = useRealtime();
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<NegotiationDetail>();
  const [content, setContent] = useState('Olá! Esta é uma nova mensagem simulada para validar a caixa de entrada.');
  const [busy, setBusy] = useState<'text' | 'audio'>();
  const [error, setError] = useState<string>();

  const loadConversations = useCallback(async () => {
    try {
      const response = await api.conversations();
      setConversations(response.data);
      setError(undefined);
      setSelectedId((current) => response.data.some((item) => item.negotiationId === current)
        ? current
        : response.data[0]?.negotiationId);
    } catch {
      setError('Não foi possível carregar as conversas.');
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations, revision]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    let active = true;
    setDetail(undefined);
    void api.negotiation(selectedId)
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
      setDetail(await api.negotiation(result.negotiationId));
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

      <aside className="demo-notice">
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
      </aside>

      <section className="conversation-layout">
        <div className="panel conversation-list" aria-label="Lista de conversas">
          <div className="panel-heading"><h2>Caixa de entrada</h2><span>{conversations.length}</span></div>
          {conversations.length === 0 ? <p className="muted">As conversas aparecerão após a primeira mensagem.</p> : conversations.map((item) => (
            <button
              type="button"
              key={item.negotiationId}
              className={`conversation-item${selectedId === item.negotiationId ? ' active' : ''}`}
              onClick={() => setSelectedId(item.negotiationId)}
            >
              <span className="contact-avatar">{item.contactName.slice(0, 1).toUpperCase()}</span>
              <span className="conversation-copy">
                <strong>{item.contactName}</strong>
                <small>{messagePreview(item)}</small>
              </span>
              <time dateTime={item.lastMessage.occurredAt}>{formatDate(item.lastMessage.occurredAt)}</time>
              <span className={`stage-badge stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
            </button>
          ))}
        </div>

        <article className="panel conversation-detail">
          {!selectedId ? (
            <div className="empty-state"><strong>Nenhuma conversa selecionada</strong><p>Simule uma mensagem para começar.</p></div>
          ) : !detail ? <LoadingState label="Abrindo conversa…" /> : (
            <>
              <div className="panel-heading conversation-heading">
                <div><p className="eyebrow">{STAGE_LABELS[detail.stage]}</p><h2>{detail.contactName}</h2></div>
                <Link className="card-link" to={`/pipeline/${detail.id}`}>Abrir negociação</Link>
              </div>
              <div className="timeline conversation-timeline">
                {detail.messages.map((message) => (
                  <article className={`message ${message.direction}`} key={message.id}>
                    <small>{message.direction === 'inbound' ? 'Recebida' : 'Enviada'} · {formatDate(message.occurredAt)}</small>
                    <p>{message.content ?? (message.messageType === 'audio' ? 'Mensagem de áudio' : 'Conteúdo não textual')}</p>
                    {message.media ? <div className="transcription">
                      <strong>Transcrição · {PROCESSING_LABELS[message.media.transcriptionState]}</strong>
                      <p>{message.media.transcriptionText ?? (message.media.transcriptionState === 'failed'
                        ? 'Não foi possível transcrever este áudio.'
                        : 'Aguardando transcrição.')}</p>
                    </div> : null}
                  </article>
                ))}
              </div>
            </>
          )}
        </article>
      </section>
    </div>
  );
}

function messagePreview(conversation: ConversationSummary): string {
  if (conversation.lastMessage.content) return conversation.lastMessage.content;
  if (conversation.lastMessage.messageType === 'audio') return 'Mensagem de áudio';
  return 'Conteúdo não textual';
}
