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

  const load = useCallback(async () => {
    setError(undefined);
    try { setConnection(await api.whatsappConnection()); }
    catch { setError('Não foi possível consultar a conexão do WhatsApp.'); }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  async function startSetup() {
    setBusy(true);
    setError(undefined);
    try { setConnection(await api.startWhatsappSetup()); }
    catch { setError('Não foi possível gerar o QR de demonstração.'); }
    finally { setBusy(false); }
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

      <section className="connection-grid">
        <article className="panel connection-status-card">
          <div className="panel-heading"><h2>Estado da conexão</h2></div>
          <span className={`connection-pill status-${connection.status}`}><span />{STATUS_LABELS[connection.status]}</span>
          <dl className="definition-list">
            <div><dt>Adapter</dt><dd>Simulador local</dd></div>
            <div><dt>Número</dt><dd>{connection.phoneNumber ?? 'Ainda não vinculado'}</dd></div>
            <div><dt>Atualizado</dt><dd>{connection.updatedAt ? new Date(connection.updatedAt).toLocaleString('pt-BR') : 'Sem atividade'}</dd></div>
          </dl>
          <button className="button primary" type="button" disabled={busy} onClick={() => void startSetup()}>
            {busy ? 'Processando…' : connection.qrCode ? 'Gerar outro QR' : 'Iniciar configuração'}
          </button>
        </article>

        <article className="panel qr-card">
          <div className="panel-heading"><div><p className="eyebrow">Ambiente local</p><h2>QR de demonstração</h2></div></div>
          {connection.qrCode ? (
            <>
              <div className="qr-frame" aria-label="QR code de demonstração">
                <QRCodeSVG value={connection.qrCode.payload} size={220} level="M" />
              </div>
              <p>Em uma integração real, este código seria lido pelo WhatsApp no telefone.</p>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void simulateScan()}>
                Simular leitura do QR
              </button>
              <small>Expira em {new Date(connection.qrCode.expiresAt).toLocaleTimeString('pt-BR')}.</small>
            </>
          ) : connection.status === 'connected' ? (
            <div className="connection-success"><span>✓</span><h3>Conexão simulada concluída</h3><p>O próximo passo será substituir o adapter falso por uma integração isolada.</p></div>
          ) : (
            <div className="connection-placeholder"><span aria-hidden="true">▦</span><p>Inicie a configuração para gerar um QR efêmero.</p></div>
          )}
        </article>
      </section>

      <aside className="demo-notice"><strong>Modo de demonstração</strong><p>Nenhuma conta real é conectada e nenhuma mensagem é enviada. O QR existe somente na memória da API.</p></aside>
    </div>
  );
}
