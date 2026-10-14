import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { formatDay, initials, timeZone } from '../utils/dates';
import { Icon, Logo } from './Icon';

export type WorkspaceView = 'browse' | 'appointments' | 'schedule' | 'availability';

export function AppShell({
  view,
  onNavigate,
  children,
}: {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const links: { id: WorkspaceView; label: string; icon: 'users' | 'calendar' }[] =
    user.role === 'student'
      ? [
          { id: 'browse', label: 'Find a tutor', icon: 'users' },
          { id: 'appointments', label: 'My appointments', icon: 'calendar' },
        ]
      : [
          { id: 'schedule', label: 'Your schedule', icon: 'calendar' },
          { id: 'availability', label: 'Manage availability', icon: 'users' },
        ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <p className="brand-subtitle">University consultations</p>
        <div className="workspace-label">{user.role} workspace</div>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <button
              key={link.id}
              className={`nav-link ${view === link.id ? 'active' : ''}`}
              aria-current={view === link.id ? 'page' : undefined}
              onClick={() => onNavigate(link.id)}
            >
              <Icon name={link.icon} />
              {link.label}
              <span className="nav-indicator" />
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="book" />
          <p>
            Booking
            <br />
            <strong>information</strong>
          </p>
          <span>
            {user.role === 'student'
              ? 'Cancel upcoming appointments from My appointments.'
              : 'Only unbooked slots can be closed.'}
          </span>
        </div>
        <div className="sidebar-footer">
          <span className="online-dot" />
          Demo accounts · Fictional data
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-date">
            <Icon name="calendar" />
            {formatDay(Date.now())}
            <span className="timezone">{timeZone}</span>
          </div>
          <div className="account">
            <span className="avatar avatar-small">{initials(user.name)}</span>
            <span className="account-name">
              {user.name}
              <small>{user.role}</small>
            </span>
            <button className="logout-button" aria-label="Sign out" onClick={logout}>
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          SlotGuard · University consultations<span>All times shown in {timeZone}</span>
        </footer>
      </div>
    </div>
  );
}
