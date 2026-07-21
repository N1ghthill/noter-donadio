import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '../api/client.js';
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

  const load = useCallback(async (term = search) => {
    setError(undefined);
    try {
      setContacts((await api.contacts(term.trim() || undefined)).data);
    } catch {
      setError('Não foi possível carregar os contatos.');
    }
  }, [search]);

  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (revision > 1) void load(); }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      setShowForm(false);
      setEditing(undefined);
      setSearch('');
      await load('');
    } catch {
      setError(`Não foi possível ${editing ? 'atualizar' : 'cadastrar'} o contato. Confira os dados e tente novamente.`);
    } finally {
      setSaving(false);
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
                <button className="button-link card-action" type="button" onClick={() => { setEditing(contact); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
