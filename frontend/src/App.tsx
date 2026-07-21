import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoadingState } from './components/Feedback.js';
import { ContactsPage } from './pages/ContactsPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { PipelinePage } from './pages/PipelinePage.js';
import { NegotiationDetailPage } from './pages/NegotiationDetailPage.js';

export function App() {
  const auth = useAuth();

  if (auth.status === 'loading') return <main className="boot-screen"><LoadingState label="Preparando seu workspace…" /></main>;
  if (auth.status === 'guest') return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="contatos" element={<ContactsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="pipeline/:id" element={<NegotiationDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
