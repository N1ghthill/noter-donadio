import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback.js';
import { formatDate } from '../lib/format.js';
import type { Contact } from '../types/api.js';

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(undefined);
    try {
      const notes = String(form.get('notes') ?? '');
      await api.createContact({
        displayName: String(form.get('displayName')),
        phoneNumber: String(form.get('phoneNumber')),
        tags: String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        ...(notes ? { notes } : {}),
      });
      event.currentTarget.reset();
      setShowForm(false);
      setSearch('');
      await load('');
    } catch {
      setError('Não foi possível cadastrar o contato. Confira os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header compact">
        <div><p className="eyebrow">Relacionamento</p><h1>Contatos</h1></div>
        <button className="button primary" type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? 'Cancelar' : 'Novo contato'}
        </button>
      </header>

      {showForm ? (
        <section className="panel form-panel" aria-labelledby="new-contact-title">
          <div className="panel-heading"><h2 id="new-contact-title">Cadastrar contato</h2></div>
          <form className="contact-form" onSubmit={(event) => void create(event)}>
            <label>Nome<input name="displayName" required maxLength={120} /></label>
            <label>Telefone<input name="phoneNumber" required placeholder="+55 71 99999-9999" /></label>
            <label>Tags<input name="tags" placeholder="cliente, indicação" /></label>
            <label className="full-width">Observações<textarea name="notes" rows={3} /></label>
            <div className="full-width form-actions"><button className="button primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar contato'}</button></div>
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
