import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { AUDIT_ACTION_LABELS, AUDIT_FIELD_LABELS, formatDateTime } from '../lib/format.js';
import type { ProcessingFailure, SessionInfo, WorkspaceAuditEvent } from '../types/api.js';

export function AdministrationPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>();
  const [auditEvents, setAuditEvents] = useState<WorkspaceAuditEvent[]>();
  const [processingFailures, setProcessingFailures] = useState<ProcessingFailure[]>();
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [sessionResponse, auditResponse, failureResponse] = await Promise.all([
        api.sessions(), api.auditEvents(), api.processingFailures(),
      ]);
      setSessions(sessionResponse.data);
      setAuditEvents(auditResponse.data);
      setProcessingFailures(failureResponse.data);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const revoke = async (session: SessionInfo) => {
    if (!window.confirm(`Encerrar ${session.current ? 'esta sessão' : 'a sessão selecionada'}?`)) return;
    setBusyId(session.id);
    try {
      await api.revokeSession(session.id);
      if (session.current) await auth.logout();
      else await load();
    } catch (requestError: unknown) {
      setError(!(requestError instanceof ApiError && requestError.status === 404));
      await load();
    } finally { setBusyId(undefined); }
  };

  const retryProcessing = async (failure: ProcessingFailure) => {
    if (!window.confirm(
      'O conteúdo desta mensagem será enviado novamente ao provedor OpenAI para processamento. Continuar?',
    )) return;
    setBusyId(failure.id);
    try {
      await api.retryProcessing(failure);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusyId(undefined);
    }
  };

  const exportWorkspace = async () => {
    setExportBusy(true);
    setExportError(false);
    try {
      const download = await api.workspaceExport();
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = download.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExportBusy(false);
    }
  };

  if (error && (!sessions || !auditEvents || !processingFailures)) return <ErrorState message="Não foi possível carregar a administração." retry={() => void load()} />;
  if (!sessions || !auditEvents || !processingFailures) return <LoadingState label="Carregando administração…" />;

  return <div className="page-stack">
    <header className="page-header"><div><p className="eyebrow">Conta e privacidade</p><h1>Administração</h1></div>
      <p>Controle acessos ativos e consulte as proteções disponíveis para os dados do workspace.</p>
    </header>
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Segurança</p><h2>Sessões ativas</h2></div><small>{sessions.length} ativa(s)</small></div>
      <div className="session-list">{sessions.map((session) => <article key={session.id}>
        <div><strong>{session.current ? 'Sessão atual' : 'Outra sessão'}</strong>
          <small>Visto por último em {formatDateTime(session.lastSeenAt)} · expira em {formatDateTime(session.expiresAt)}</small></div>
        <button className="button secondary" type="button" disabled={busyId === session.id} onClick={() => void revoke(session)}>
          {busyId === session.id ? 'Encerrando…' : 'Encerrar sessão'}
        </button>
      </article>)}</div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Processamento assistivo</p><h2>Falhas que exigem revisão</h2></div>
        <small>{processingFailures.length} registro(s)</small></div>
      <p className="muted">Nenhuma mensagem é reenviada ao provedor automaticamente. A nova tentativa exige sua confirmação.</p>
      {processingFailures.length === 0 ? <p className="muted">Nenhuma falha de IA ou transcrição registrada.</p> :
        <div className="session-list">{processingFailures.map((failure) => <article key={`${failure.kind}-${failure.id}`}>
          <div><strong>{failure.kind === 'analysis' ? 'Análise de mensagem' : 'Transcrição de áudio'} · {failure.contactName}</strong>
            <small>{processingFailureLabel(failure.failureCode)} · {formatDateTime(failure.failedAt)}</small>
            {!failure.retryEligible ? <small>Registro anterior ao corte autorizado; nova tentativa bloqueada.</small> : null}</div>
          <button className="button secondary" type="button" disabled={!failure.retryEligible || busyId === failure.id}
            onClick={() => void retryProcessing(failure)}>
            {busyId === failure.id ? 'Agendando…' : 'Tentar novamente'}
          </button>
        </article>)}</div>}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Rastreabilidade</p><h2>Auditoria do workspace</h2></div>
        <small>Últimos {auditEvents.length} evento(s)</small></div>
      {auditEvents.length === 0 ? <p className="muted">Nenhuma ação auditável registrada.</p> :
        <div className="session-list">{auditEvents.map((event) => <article key={event.id}>
          <div><strong>{AUDIT_ACTION_LABELS[event.action]}</strong>
            <small>{event.actorDisplayName} · {formatDateTime(event.createdAt)}</small>
            {event.changedFields.length > 0 ? <small>Campos: {event.changedFields.map((field) => AUDIT_FIELD_LABELS[field] ?? field).join(', ')}</small> : null}
          </div>
        </article>)}</div>}
    </section>
    <section className="panel privacy-summary">
      <div className="panel-heading"><div><p className="eyebrow">Privacidade</p><h2>Controles implementados</h2></div></div>
      <ul><li>Exclusão de contatos exige confirmação explícita e remove mídias associadas.</li>
        <li>Mídias usam acesso temporário assinado e retenção configurável.</li>
        <li>Auditoria preserva somente metadados necessários, sem conteúdo de mensagens.</li></ul>
      <div className="form-actions">
        <button className="button secondary" type="button" disabled={exportBusy} onClick={() => void exportWorkspace()}>
          {exportBusy ? 'Preparando exportação…' : 'Exportar dados do workspace'}
        </button>
      </div>
      {exportError ? <p className="error-text">Não foi possível exportar os dados agora.</p> : null}
      <p className="muted">O arquivo contém dados pessoais e comerciais. Guarde-o em local seguro.</p>
      <p className="muted">A exclusão integral do workspace permanece restrita ao procedimento operacional autenticado para evitar remoções acidentais.</p>
    </section>
  </div>;
}

function processingFailureLabel(code: string): string {
  if (code.endsWith('AUTHENTICATION_FAILED')) return 'Credencial do provedor recusada';
  if (code.endsWith('PERMISSION_DENIED')) return 'Credencial sem permissão';
  if (code.endsWith('RATE_LIMITED')) return 'Limite temporário do provedor';
  if (code.endsWith('MODEL_NOT_FOUND')) return 'Modelo indisponível';
  if (code.endsWith('REQUEST_REJECTED')) return 'Requisição recusada pelo provedor';
  if (code.endsWith('TIMEOUT')) return 'Tempo limite excedido';
  if (code.endsWith('PROVIDER_UNAVAILABLE')) return 'Provedor temporariamente indisponível';
  if (code.endsWith('OUTPUT_INVALID')) return 'Resposta fora do contrato esperado';
  if (code.endsWith('INPUT_INVALID')) return 'Mídia ou entrada não elegível';
  return 'Falha de processamento';
}
