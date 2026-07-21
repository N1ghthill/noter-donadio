import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoadingState } from './components/Feedback.js';
import { LoginPage } from './pages/LoginPage.js';
import { RealtimeProvider } from './realtime/RealtimeContext.js';

const ContactsPage = lazy(async () => ({ default: (await import('./pages/ContactsPage.js')).ContactsPage }));
const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage.js')).DashboardPage }));
const PipelinePage = lazy(async () => ({ default: (await import('./pages/PipelinePage.js')).PipelinePage }));
const NegotiationDetailPage = lazy(async () => ({ default: (await import('./pages/NegotiationDetailPage.js')).NegotiationDetailPage }));

export function App() {
  const auth = useAuth();

  if (auth.status === 'loading') return <main className="boot-screen"><LoadingState label="Preparando seu workspace…" /></main>;
  if (auth.status === 'guest') return <LoginPage />;

  return (
    <RealtimeProvider>
      <Suspense fallback={<LoadingState label="Carregando tela…" />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="contatos" element={<ContactsPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="pipeline/:id" element={<NegotiationDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </RealtimeProvider>
  );
}
