import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { MediaPreview } from '../components/MediaPreview.js';
import { formatDateTime, PROCESSING_LABELS } from '../lib/format.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { Contact, ContactFile } from '../types/api.js';

type FileType = 'all' | 'audio' | 'image' | 'document';
type Direction = 'all' | 'inbound' | 'outbound';
type Period = 'all' | 'today' | '7d' | '30d';

const TYPE_LABELS = { audio: 'Áudio', image: 'Imagem', document: 'Documento' } as const;

export function FilesPage() {
  const { revision } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>();
  const [files, setFiles] = useState<ContactFile[]>();
  const [contactId, setContactId] = useState(searchParams.get('contactId') ?? '');
  const [fileType, setFileType] = useState<FileType>(fileTypeFrom(searchParams.get('fileType')));
  const [direction, setDirection] = useState<Direction>(directionFrom(searchParams.get('direction')));
  const [period, setPeriod] = useState<Period>(periodFrom(searchParams.get('period')));
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') ?? '');
  const [search, setSearch] = useState((searchParams.get('search') ?? '').trim());
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (contactId) params.set('contactId', contactId);
    if (fileType !== 'all') params.set('fileType', fileType);
    if (direction !== 'all') params.set('direction', direction);
    if (period !== 'all') params.set('period', period);
    if (search) params.set('search', search);
    setSearchParams(params, { replace: true });
  }, [contactId, direction, fileType, period, search, setSearchParams]);

  const load = useCallback(async (offset = 0, append = false) => {
    setError(false);
    const range = periodRange(period);
    try {
      const [contactResponse, fileResponse] = await Promise.all([
        api.contacts(),
        api.files({
          ...(contactId ? { contactId } : {}),
          ...(search ? { search } : {}),
          ...(fileType !== 'all' ? { fileType } : {}),
          ...(direction !== 'all' ? { direction } : {}),
          ...range,
          limit: 50,
          offset,
        }),
      ]);
      setContacts(contactResponse.data);
      setFiles((current) => append && current
        ? [...current, ...fileResponse.data.filter((file) => (
            !current.some((existing) => existing.messageId === file.messageId)
          ))]
        : fileResponse.data);
      setNextOffset(fileResponse.meta.nextOffset);
    } catch {
      setError(true);
    }
  }, [contactId, direction, fileType, period, search]);

  useEffect(() => { void load(); }, [load, revision]);

  function clearFilters() {
    setContactId('');
    setFileType('all');
    setDirection('all');
    setPeriod('all');
    setSearchDraft('');
    setSearch('');
  }

  async function loadMore(): Promise<void> {
    if (nextOffset === null) return;
    setLoadingMore(true);
    await load(nextOffset, true);
    setLoadingMore(false);
  }

  if (error && (!contacts || !files)) {
    return <ErrorState message="Não foi possível carregar os arquivos." retry={() => void load()} />;
  }
  if (!contacts || !files) return <LoadingState label="Organizando seus arquivos…" />;

  return (
    <div className="page-stack files-page">
      <header className="page-header">
        <div><p className="eyebrow">Biblioteca</p><h1>Arquivos por contato</h1></div>
        <p>Encontre áudios, imagens e documentos pelo contexto da conversa, sem pastas ou links públicos.</p>
      </header>
      {error ? <ErrorState message="Não foi possível atualizar os arquivos." /> : null}

      <section className="file-type-tabs" aria-label="Filtrar por tipo">
        <button className={fileType === 'all' ? 'active' : ''} type="button" onClick={() => setFileType('all')}>
          Todos
        </button>
        <button className={fileType === 'image' ? 'active' : ''} type="button" onClick={() => setFileType('image')}>
          Imagens
        </button>
        <button className={fileType === 'document' ? 'active' : ''} type="button" onClick={() => setFileType('document')}>
          Documentos
        </button>
        <button className={fileType === 'audio' ? 'active' : ''} type="button" onClick={() => setFileType('audio')}>
          Áudios
        </button>
      </section>

      <section className="panel file-filters">
        <label className="file-search">Buscar
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Nome do arquivo, contato ou legenda"
          />
        </label>
        <label>Contato
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Todos os contatos</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
          </select>
        </label>
        <label>Origem
          <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
            <option value="all">Enviados e recebidos</option>
            <option value="inbound">Recebidos</option>
            <option value="outbound">Enviados</option>
          </select>
        </label>
        <label>Período
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="all">Todo o período</option>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
        </label>
        <button className="button-link" type="button" onClick={clearFilters}>Limpar filtros</button>
      </section>

      <section className="panel file-results">
        <div className="panel-heading">
          <div><p className="eyebrow">Resultados</p><h2>{files.length} arquivo(s) encontrado(s)</h2></div>
        </div>
        {files.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum arquivo encontrado</strong>
            <p>Ajuste os filtros ou aguarde a próxima mídia recebida pelo WhatsApp.</p>
            <button className="button secondary" type="button" onClick={clearFilters}>Ver todos os arquivos</button>
          </div>
        ) : (
          <div className="file-grid">
            {files.map((file) => (
              <article className={`file-card file-${file.messageType}`} key={file.messageId}>
                <div className="file-card-preview">
                  <span className="file-kind">{TYPE_LABELS[file.messageType]}</span>
                  <MediaPreview
                    messageId={file.messageId}
                    messageType={file.messageType}
                    fileName={file.fileName}
                  />
                </div>
                <div className="file-card-copy">
                  <strong title={file.fileName}>{file.fileName}</strong>
                  <span>{file.contactName}</span>
                  {file.caption ? <p>{file.caption}</p> : null}
                  <dl>
                    <div><dt>Data</dt><dd>{formatDateTime(file.occurredAt)}</dd></div>
                    <div><dt>Origem</dt><dd>{file.direction === 'inbound' ? 'Recebido' : 'Enviado'}</dd></div>
                    <div><dt>Tamanho</dt><dd>{formatBytes(file.fileSizeBytes)}</dd></div>
                    {file.messageType === 'audio'
                      ? <div><dt>Transcrição</dt><dd>{PROCESSING_LABELS[file.transcriptionState]}</dd></div>
                      : null}
                    {file.retentionUntil
                      ? <div><dt>Disponível até</dt><dd>{formatDateTime(file.retentionUntil)}</dd></div>
                      : null}
                  </dl>
                  {file.negotiationId
                    ? <div className="file-card-links">
                        <Link to={`/conversas?period=all&selected=${file.negotiationId}`}>Abrir conversa</Link>
                        <Link to={`/pipeline/${file.negotiationId}`}>Abrir negociação</Link>
                      </div>
                    : <span className="muted">Sem negociação relacionada</span>}
                </div>
              </article>
            ))}
          </div>
        )}
        {nextOffset !== null ? (
          <div className="pagination-actions">
            <button className="button secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Carregando…' : 'Carregar mais arquivos'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function periodRange(period: Period): { occurredFrom?: string; occurredTo?: string } {
  if (period === 'all') return {};
  const to = new Date();
  if (period === 'today') {
    const from = new Date(to);
    from.setHours(0, 0, 0, 0);
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { occurredFrom: from.toISOString(), occurredTo: tomorrow.toISOString() };
  }
  const from = new Date(to);
  from.setDate(from.getDate() - (period === '7d' ? 7 : 30));
  return { occurredFrom: from.toISOString(), occurredTo: to.toISOString() };
}

function fileTypeFrom(value: string | null): FileType {
  return value === 'audio' || value === 'image' || value === 'document' ? value : 'all';
}

function directionFrom(value: string | null): Direction {
  return value === 'inbound' || value === 'outbound' ? value : 'all';
}

function periodFrom(value: string | null): Period {
  return value === 'today' || value === '7d' || value === '30d' ? value : 'all';
}

function formatBytes(value: string | null): string {
  if (!value) return 'Não informado';
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return 'Não informado';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
