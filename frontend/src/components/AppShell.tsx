import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.js';

const navigation: Array<{ to: string; label: string; end: boolean }> = [
  { to: '/', label: 'Visão geral', end: true },
  { to: '/contatos', label: 'Contatos', end: false },
  { to: '/pipeline', label: 'Pipeline', end: false },
];

export function AppShell() {
  const auth = useAuth();

  return (
    <div className="app-frame">
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
        <div className="sidebar-user">
          <span className="avatar">{auth.user?.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{auth.user?.displayName}</strong>
            <small>{auth.user?.email}</small>
          </div>
          <button className="button-link" type="button" onClick={() => void auth.logout()}>
            Sair
          </button>
        </div>
      </aside>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
