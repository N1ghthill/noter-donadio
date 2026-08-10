import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { ApiError, api } from '../api/client.js';
import { ErrorState, LoadingState } from '../components/Feedback.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { WhatsappConnection } from '../types/api.js';

const STATUS_LABELS: Record<WhatsappConnection['status'], string> = {
  disconnected: 'Desconectado',
  qr_generated: 'Aguardando leitura do QR',
  connecting: 'Conectando',
  connected: 'Conectado',
  timeout: 'QR expirado',
};

export function WhatsappSetupPage() {
  const { revision } = useRealtime();
  const [connection, setConnection] = useState<WhatsappConnection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await api.whatsappConnection();
      setConnection(result);
      if (result.adapter === 'baileys' && result.status !== 'connected') setRecoveryOpen(true);
    }
    catch { setError('Não foi possível consultar a conexão do WhatsApp.'); }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  async function startSetup() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try { setConnection(await api.startWhatsappSetup()); }
    catch (caught: unknown) {
      if (caught instanceof ApiError && caught.code === 'already_connected') {
        setError('A sessão já está conectada. Não é necessário gerar outro QR.');
        await load();
      } else {
        setError('Não foi possível gerar o QR do WhatsApp. Tente novamente em alguns instantes.');
      }
    }
    finally { setBusy(false); }
  }

  async function prepareRecovery() {
    if (!connection?.accountId) return;
    const confirmed = window.confirm(
      'Gerar uma nova conexão para este workspace? Somente as credenciais antigas do WhatsApp serão removidas. Contatos, negociações, mensagens e arquivos permanecerão no CRM. Leia o novo QR no telefone oficial da empresa.',
    );
    if (!confirmed) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setConnection(await api.resetWhatsappAuthentication(connection.accountId));
      setNotice('Credenciais antigas removidas com segurança. Agora gere o QR e leia-o no telefone oficial da empresa.');
    } catch (caught: unknown) {
      if (caught instanceof ApiError && caught.code === 'still_connected') {
        setError('A sessão ainda está conectada. Não é necessário gerar outro QR. Atualize o estado antes de tentar novamente.');
        await load();
      } else {
        setError('Não foi possível preparar a recuperação da conexão.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function simulateScan() {
    setBusy(true);
    setError(undefined);
    try { setConnection(await api.simulateWhatsappConnection()); }
    catch (caught: unknown) {
      setError(caught instanceof ApiError && caught.code === 'qr_unavailable'
        ? 'O QR não está mais disponível. Gere um novo código.'
        : 'Não foi possível concluir a conexão simulada.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !connection) return <ErrorState message={error} retry={() => void load()} />;
  if (!connection) return <LoadingState label="Consultando conexão…" />;

  return (
    <div className="page-stack whatsapp-page">
      <header className="page-header">
        <div><p className="eyebrow">Integrações</p><h1>WhatsApp</h1></div>
        <p>Prepare a conexão e acompanhe o estado da sessão sem expor credenciais no navegador.</p>
      </header>
      {error ? <ErrorState message={error} /> : null}
      {notice ? <p className="muted" role="status">{notice}</p> : null}

      <section className="connection-grid">
        <article className="panel connection-status-card">
          <div className="panel-heading"><h2>Estado da conexão</h2></div>
          <span className={`connection-pill status-${connection.status}`}><span />{STATUS_LABELS[connection.status]}</span>
          <dl className="definition-list">
            <div><dt>Adapter</dt><dd>{connection.adapter === 'fake' ? 'Simulador local' : 'Baileys'}</dd></div>
            <div><dt>Número</dt><dd>{connection.phoneNumber ?? 'Ainda não vinculado'}</dd></div>
            <div><dt>Atualizado</dt><dd>{connection.updatedAt ? new Date(connection.updatedAt).toLocaleString('pt-BR') : 'Sem atividade'}</dd></div>
          </dl>
          {connection.adapter === 'baileys' && connection.status !== 'connected' ? (
            <>
              <a className="button primary" href="#whatsapp-recovery" onClick={() => setRecoveryOpen(true)}>
                {connection.accountId && connection.phoneNumber ? 'Recuperar conexão' : 'Continuar recuperação'}
              </a>
              <small>Use a recuperação somente quando a sessão estiver desconectada.</small>
            </>
          ) : connection.status !== 'connected' ? (
            <button className="button primary" type="button" disabled={busy} onClick={() => void startSetup()}>
              {busy ? 'Processando…' : connection.qrCode ? 'Gerar outro QR' : 'Iniciar configuração'}
            </button>
          ) : <>
            <small>A sessão está ativa. Um novo QR só será necessário se ela for desconectada.</small>
            {connection.adapter === 'baileys' ? (
              <button className="button secondary" type="button" onClick={() => setRecoveryOpen((value) => !value)}>
                {recoveryOpen ? 'Ocultar recuperação' : 'Ver plano de recuperação'}
              </button>
            ) : null}
          </>}
        </article>

        <article className="panel qr-card">
          <div className="panel-heading"><div><p className="eyebrow">{connection.adapter === 'fake' ? 'Ambiente local' : 'Aparelho conectado'}</p><h2>{connection.adapter === 'fake' ? 'QR de demonstração' : 'QR do WhatsApp'}</h2></div></div>
          {connection.qrCode ? (
            <>
              <div className="qr-frame" aria-label={connection.adapter === 'fake' ? 'QR code de demonstração' : 'QR code do WhatsApp'}>
                <QRCodeSVG value={connection.qrCode.payload} size={220} level="M" />
              </div>
              <p>{connection.adapter === 'fake'
                ? 'Em uma integração real, este código seria lido pelo WhatsApp no telefone.'
                : 'Leia este código em Aparelhos conectados no WhatsApp do telefone.'}</p>
              {connection.canSimulate ? (
                <button className="button secondary" type="button" disabled={busy} onClick={() => void simulateScan()}>
                  Simular leitura do QR
                </button>
              ) : null}
              <small>Expira em {new Date(connection.qrCode.expiresAt).toLocaleTimeString('pt-BR')}.</small>
            </>
          ) : connection.status === 'connected' ? (
            <div className="connection-success"><span>✓</span><h3>{connection.adapter === 'fake' ? 'Conexão simulada concluída' : 'WhatsApp conectado'}</h3><p>{connection.adapter === 'fake' ? 'O simulador está pronto para a demonstração.' : 'Novas mensagens de texto e áudio serão organizadas automaticamente no CRM.'}</p></div>
          ) : (
            <div className="connection-placeholder"><span aria-hidden="true">▦</span><p>Inicie a configuração para gerar um QR efêmero.</p></div>
          )}
        </article>
      </section>

      {connection.adapter === 'baileys' && recoveryOpen ? (
        <section className="panel whatsapp-recovery" id="whatsapp-recovery" aria-labelledby="whatsapp-recovery-title">
          <div className="panel-heading"><div><p className="eyebrow">Plano de contingência</p>
            <h2 id="whatsapp-recovery-title">Recuperação do WhatsApp</h2></div>
            <span className={`status-pill ${connection.status === 'connected' ? 'success' : 'warning'}`}>
              {connection.status === 'connected' ? 'Não requer ação' : 'Siga os passos'}
            </span></div>
          {connection.status === 'connected' ? (
            <p className="recovery-callout success"><strong>A conexão está saudável.</strong> Não remova aparelhos conectados e não gere outro QR enquanto este estado permanecer ativo.</p>
          ) : (
            <p className="recovery-callout warning"><strong>A conexão precisa ser recuperada.</strong> O procedimento abaixo preserva todo o histórico do CRM.</p>
          )}
          <ol className="recovery-steps">
            <li><span>1</span><div><strong>Confirme o telefone correto</strong><p>Tenha em mãos o aparelho oficial da empresa com o WhatsApp funcionando.</p></div></li>
            <li><span>2</span><div><strong>Libere uma nova autenticação</strong><p>Esta etapa apaga somente as credenciais antigas da conexão, nunca contatos ou conversas do CRM.</p></div></li>
            <li><span>3</span><div><strong>Leia o QR Code</strong><p>No telefone, abra WhatsApp → Aparelhos conectados → Conectar um aparelho e leia o código desta tela.</p></div></li>
          </ol>
          {connection.status !== 'connected' && connection.accountId && connection.phoneNumber ? (
            <div className="recovery-actions">
              <button className="button secondary" type="button" disabled={busy} onClick={() => void prepareRecovery()}>
                {busy ? 'Liberando…' : 'Liberar novo QR com segurança'}
              </button>
              <small>Esta ação fica bloqueada se o servidor detectar que a sessão ainda está conectada.</small>
            </div>
          ) : connection.status !== 'connected' && !connection.qrCode ? (
            <div className="recovery-actions">
              <button className="button primary" type="button" disabled={busy} onClick={() => void startSetup()}>
                {busy ? 'Gerando…' : 'Gerar QR de recuperação'}
              </button>
              <small>Leia o código somente no telefone oficial da empresa.</small>
            </div>
          ) : connection.qrCode ? <p className="recovery-callout neutral">QR pronto. Conclua o passo 3 antes do horário de expiração indicado acima.</p> : null}
        </section>
      ) : null}

      {connection.adapter === 'fake' ? (
        <aside className="demo-notice"><strong>Modo de demonstração</strong><p>Nenhuma conta real é conectada e nenhuma mensagem é enviada. O QR existe somente na memória da API.</p></aside>
      ) : null}
    </div>
  );
}
