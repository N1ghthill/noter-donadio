import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError, api } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate } from '../lib/format.js';
import type { Contact } from '../types/api.js';
import { useRealtime } from '../realtime/RealtimeContext.js';

export function ContactsPage() {
  const { revision } = useRealtime();
  const [contacts, setContacts] = useState<Contact[]>();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const [mergingId, setMergingId] = useState<string>();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (term = search, offset = 0, append = false) => {
    setError(undefined);
    try {
      const response = await api.contacts(term.trim() || undefined, { limit: 50, offset });
      setContacts((current) => append && current
        ? [...current, ...response.data.filter((contact) => (
            !current.some((existing) => existing.id === contact.id)
          ))]
        : response.data);
      setNextOffset(response.meta.nextOffset);
    } catch {
      setError('Não foi possível carregar os contatos.');
    }
  }, [search]);

  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (revision > 1) void load(); }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError(undefined);
    try {
      const notes = String(form.get('notes') ?? '');
      const values = {
        displayName: String(form.get('displayName')),
        phoneNumber: String(form.get('phoneNumber')),
        tags: String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        notes: notes || null,
      };
      if (editing) await api.updateContact(editing.id, values);
      else await api.createContact({
        displayName: values.displayName,
        phoneNumber: values.phoneNumber,
        tags: values.tags,
        ...(notes ? { notes } : {}),
      });
      formElement.reset();
      setShowForm(false);
      setEditing(undefined);
      setSearch('');
      await load('');
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'contact_phone_exists'
        ? 'Já existe um contato com este telefone. Localize-o antes de criar outro.'
        : `Não foi possível ${editing ? 'atualizar' : 'cadastrar'} o contato. Confira os dados e tente novamente.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(contact: Contact): Promise<void> {
    const confirmed = window.confirm(
      `Excluir ${contact.displayName}? Conversas, negociações, análises e mídias associadas serão removidas. Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setDeletingId(contact.id);
    setError(undefined);
    try {
      await api.deleteContact(contact.id);
      if (editing?.id === contact.id) {
        setEditing(undefined);
        setShowForm(false);
      }
      await load();
    } catch {
      setError('Não foi possível excluir o contato. Tente novamente.');
    } finally {
      setDeletingId(undefined);
    }
  }

  async function loadMore(): Promise<void> {
    if (nextOffset === null) return;
    setLoadingMore(true);
    await load(search, nextOffset, true);
    setLoadingMore(false);
  }

  async function merge(target: Contact, source: Contact): Promise<void> {
    if (!window.confirm(
      `Consolidar "${source.displayName}" em "${target.displayName}"? Mensagens, arquivos e negociações serão preservados no contato mantido.`,
    )) return;
    setMergingId(source.id);
    setError(undefined);
    try {
      await api.mergeContacts(target.id, source.id);
      if (editing?.id === source.id) {
        setEditing(undefined);
        setShowForm(false);
      }
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'contact_merge_conflict'
        ? 'A consolidação exige o mesmo telefone e no máximo uma negociação ativa entre os dois contatos.'
        : 'Não foi possível consolidar os contatos.');
    } finally {
      setMergingId(undefined);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header compact">
        <div><p className="eyebrow">Relacionamento</p><h1>Contatos</h1></div>
        <button className="button primary" type="button" onClick={() => { setEditing(undefined); setShowForm((value) => !value); }}>
          {showForm ? 'Cancelar' : 'Novo contato'}
        </button>
      </header>

      {showForm ? (
        <section className="panel form-panel" aria-labelledby="contact-form-title">
          <div className="panel-heading"><h2 id="contact-form-title">{editing ? 'Editar contato' : 'Cadastrar contato'}</h2></div>
          <form className="contact-form" key={editing?.id ?? 'new'} onSubmit={(event) => void create(event)}>
            <label>Nome<input name="displayName" required maxLength={120} defaultValue={editing?.displayName} /></label>
            <label>Telefone<input name="phoneNumber" required placeholder="+55 71 99999-9999" defaultValue={editing?.phoneNumber} /></label>
            <label>Tags<input name="tags" placeholder="cliente, indicação" defaultValue={editing?.tags.join(', ')} /></label>
            <label className="full-width">Observações<textarea name="notes" rows={3} defaultValue={editing?.notes ?? ''} /></label>
            <div className="full-width form-actions"><button className="button primary" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Atualizar contato' : 'Salvar contato'}</button></div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <form className="search-bar" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label className="visually-hidden" htmlFor="contact-search">Buscar contatos</label>
          <input id="contact-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou telefone" />
          <button className="button secondary" type="submit">Buscar</button>
        </form>
        {error ? <ErrorState message={error} retry={() => void load()} /> : !contacts ? <LoadingState label="Carregando contatos…" /> : contacts.length === 0 ? (
          <EmptyState title="Nenhum contato encontrado" description="Cadastre uma pessoa ou ajuste sua busca." />
        ) : (
          <div className="contact-grid">
            {contacts.map((contact) => (
              <article className="contact-card" key={contact.id}>
                <div className="contact-avatar">{contact.displayName.slice(0, 1).toUpperCase()}</div>
                <div><h3>{contact.displayName}</h3><a href={`tel:${contact.phoneNumber}`}>{contact.phoneNumber}</a></div>
                <div className="tag-list">{contact.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <small>{formatDate(contact.lastInteractionAt)}</small>
                <div className="card-actions">
                  {contacts.find((candidate) => (
                    candidate.id !== contact.id && candidate.phoneNumber === contact.phoneNumber
                  )) ? (
                    <button
                      className="button-link"
                      type="button"
                      disabled={Boolean(deletingId || mergingId)}
                      onClick={() => {
                        const source = contacts.find((candidate) => (
                          candidate.id !== contact.id && candidate.phoneNumber === contact.phoneNumber
                        ));
                        if (source) void merge(contact, source);
                      }}
                    >
                      {mergingId ? 'Consolidando…' : 'Manter este e consolidar duplicado'}
                    </button>
                  ) : null}
                  <button className="button-link" type="button" disabled={Boolean(deletingId)} onClick={() => { setEditing(contact); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                  <button className="button-link danger" type="button" disabled={Boolean(deletingId)} onClick={() => void remove(contact)}>
                    {deletingId === contact.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {nextOffset !== null ? (
          <div className="pagination-actions">
            <button className="button secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Carregando…' : 'Carregar mais contatos'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
