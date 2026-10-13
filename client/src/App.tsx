import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import { AppShell, type WorkspaceView } from './components/AppShell';
import { ErrorState, LoadingState } from './components/Feedback';
import { Logo } from './components/Icon';
import { LoginPage } from './pages/LoginPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { TutorDashboard } from './pages/TutorDashboard';
import type { User } from './types';

function Workspace({ user }: { user: User }) {
  const [view, setView] = useState<WorkspaceView>(user.role === 'student' ? 'browse' : 'schedule');
  useEffect(() => {
    document.getElementById('main-content')?.focus();
  }, []);
  return (
    <AppShell view={view} onNavigate={setView}>
      {user.role === 'student' ? (
        <StudentDashboard view={view} onNavigate={setView} />
      ) : (
        <TutorDashboard view={view} />
      )}
    </AppShell>
  );
}

export function App() {
  const { user, status, message, retry, logout } = useAuth();
  if (status === 'checking' || status === 'unavailable')
    return (
      <main className="session-page">
        <Logo />
        <section className="panel">
          {status === 'checking' ? (
            <LoadingState label="Restoring your session…" />
          ) : (
            <>
              <ErrorState message={message} onRetry={retry} />
              <button className="text-button" onClick={logout}>
                Return to sign in
              </button>
            </>
          )}
        </section>
      </main>
    );
  return status === 'authenticated' && user ? (
    <Workspace key={user.id} user={user} />
  ) : (
    <LoginPage />
  );
}
