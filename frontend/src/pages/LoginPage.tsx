import { useState, type FormEvent } from 'react';

import { ApiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

export function LoginPage() {
  const auth = useAuth();
  const [workspace, setWorkspace] = useState('noter-donadio');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await auth.login({ workspace, email, password });
    } catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.status === 401
        ? 'E-mail, senha ou workspace inválido.'
        : 'Não foi possível entrar agora. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-copy">
        <p className="eyebrow">noter.donadio</p>
        <h1>Conversas viram oportunidades claras.</h1>
        <p>Seu pipeline comercial, enriquecido por IA e sempre sob seu controle.</p>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Acesso restrito</p>
        <h2 id="login-title">Entre na sua conta</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label>Workspace<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} required /></label>
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete="current-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
