import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { AudioPlayer } from '../components/AudioPlayer.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDateTime, PROCESSING_LABELS } from '../lib/format.js';
import type { Contact, ContactFile } from '../types/api.js';

export function FilesPage() {
  const [contacts, setContacts] = useState<Contact[]>();
  const [files, setFiles] = useState<ContactFile[]>();
  const [contactId, setContactId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [contactResponse, fileResponse] = await Promise.all([
        api.contacts(),
        api.files({
          ...(contactId ? { contactId } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
      ]);
      setContacts(contactResponse.data);
      setFiles(fileResponse.data);
    } catch {
      setError(true);
    }
  }, [contactId, search]);

  useEffect(() => { void load(); }, [load]);

  if (error && (!contacts || !files)) return <ErrorState message="Não foi possível carregar os arquivos." retry={() => void load()} />;
  if (!contacts || !files) return <LoadingState label="Carregando arquivos…" />;

  return (
    <div className="page-stack files-page">
      <header className="page-header">
        <div><p className="eyebrow">Arquivos</p><h1>Arquivos por contato</h1></div>
        <p>Localize mídias preservadas sem expor caminhos internos ou URLs permanentes.</p>
      </header>
      {error ? <ErrorState message="Não foi possível atualizar os arquivos." /> : null}

      <section className="panel filter-panel">
        <label>Contato
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            <option value="">Todos os contatos</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
          </select>
        </label>
        <label>Buscar contato
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do contato" />
        </label>
      </section>

      <section className="panel notion-panel">
        <div className="panel-heading"><h2>Mídias disponíveis</h2><span>{files.length} arquivo(s)</span></div>
        {files.length === 0 ? <p className="muted">Nenhum arquivo disponível para os filtros.</p> : (
          <div className="notion-table files-table">
            <div className="notion-row notion-header"><span>Arquivo</span><span>Contato</span><span>Data</span><span>Tamanho</span><span>Transcrição</span><span>Reprodução</span><span>Contexto</span></div>
            {files.map((file) => (
              <article className="notion-row" key={file.messageId}>
                <strong>{file.fileName}</strong>
                <span>{file.contactName}</span>
                <span>{formatDateTime(file.occurredAt)}</span>
                <span>{formatBytes(file.fileSizeBytes)}</span>
                <span>{PROCESSING_LABELS[file.transcriptionState]}</span>
                <AudioPlayer messageId={file.messageId} playbackAvailable />
                <span>{file.negotiationId ? <Link to={`/pipeline/${file.negotiationId}`}>Abrir negociação</Link> : 'Sem negociação'}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatBytes(value: string | null): string {
  if (!value) return 'Não informado';
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return 'Não informado';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
