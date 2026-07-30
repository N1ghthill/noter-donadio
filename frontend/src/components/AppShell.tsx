import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useRealtime } from '../realtime/RealtimeContext.js';
import type { Dashboard } from '../types/api.js';

const navigation: Array<{ to: string; label: string; end: boolean }> = [
  { to: '/', label: 'Home', end: true },
  { to: '/controle', label: 'Controle', end: false },
  { to: '/contatos', label: 'Contatos', end: false },
  { to: '/pipeline', label: 'Pipeline', end: false },
  { to: '/conversas', label: 'Conversas', end: false },
  { to: '/agenda', label: 'Tarefas', end: false },
  { to: '/arquivos', label: 'Arquivos', end: false },
  { to: '/whatsapp', label: 'WhatsApp', end: false },
  { to: '/administracao', label: 'Administração', end: false },
  { to: '/piloto', label: 'Piloto', end: false },
];

export function AppShell() {
  const auth = useAuth();
  const realtime = useRealtime();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void api.dashboard()
      .then((result) => { if (active) setDashboard(result); })
      .catch(() => { if (active) setDashboard(undefined); });
    return () => { active = false; };
  }, [realtime.revision]);

  const pendingCount = dashboard
    ? dashboard.overdueFollowUpsCount + dashboard.todayFollowUpsCount + dashboard.missingFollowUpsCount
    : undefined;

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Ir para o conteúdo principal</a>
      <aside className="sidebar">
        <div>
          <p className="brand-mark">n.</p>
          <p className="brand-name">noter.donadio</p>
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="notification-center">
          <button
            className={`notification-trigger${pendingCount ? ' has-pending' : ''}`}
            type="button"
            aria-expanded={notificationsOpen}
            aria-controls="notification-panel"
            aria-label={pendingCount === undefined ? 'Pendências indisponíveis' : `Pendências: ${pendingCount}`}
            onClick={() => setNotificationsOpen((value) => !value)}
          >
            <span>Pendências</span>
            <strong aria-hidden="true">{pendingCount ?? '—'}</strong>
          </button>
          {notificationsOpen ? (
            <div className="notification-panel" id="notification-panel">
              <strong>Resumo de acompanhamento</strong>
              {!dashboard ? <small>Não foi possível atualizar agora.</small> : pendingCount === 0 ? (
                <small>Nenhuma pendência comercial neste momento.</small>
              ) : (
                <>
                  <Link
                    to="/agenda?followUp=overdue"
                    aria-label={`Ações vencidas: ${dashboard.overdueFollowUpsCount}`}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <span>Ações vencidas</span><strong>{dashboard.overdueFollowUpsCount}</strong>
                  </Link>
                  <Link
                    to="/agenda?followUp=today"
                    aria-label={`Vencem hoje: ${dashboard.todayFollowUpsCount}`}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <span>Vencem hoje</span><strong>{dashboard.todayFollowUpsCount}</strong>
                  </Link>
                  <Link
                    to="/agenda?followUp=missing"
                    aria-label={`Sem próxima ação: ${dashboard.missingFollowUpsCount}`}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <span>Sem próxima ação</span><strong>{dashboard.missingFollowUpsCount}</strong>
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="sidebar-user">
          <span className="avatar">{auth.user?.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{auth.user?.displayName}</strong>
            <small>{auth.user?.email}</small>
          </div>
          <button className="button-link" type="button" onClick={() => void auth.logout()}>
            Sair
          </button>
          <span className={`realtime-status${realtime.connected ? ' online' : ''}`}>
            <span aria-hidden="true" />{realtime.connected ? 'Tempo real ativo' : 'Reconectando…'}
          </span>
        </div>
        <div className="mobile-session">
          <span className={`realtime-status${realtime.connected ? ' online' : ''}`}>
            <span aria-hidden="true" />{realtime.connected ? 'Tempo real ativo' : 'Reconectando…'}
          </span>
          <button className="button-link" type="button" onClick={() => void auth.logout()}>
            Sair
          </button>
        </div>
      </aside>
      <main className="app-content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
