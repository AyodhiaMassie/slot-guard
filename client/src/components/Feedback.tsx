import { useEffect, useState } from 'react';
import type { Notice } from '../types';
import { Icon } from './Icon';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="state-box" role="status">
      <span className="spinner" />
      <p>{slow ? 'Connecting to SlotGuard. This may take a moment.' : label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-box state-error">
      <span className="state-icon">
        <Icon name="refresh" />
      </span>
      <h3>Unable to load data</h3>
      <p role="alert">{message}</p>
      <button className="button button-secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-box">
      <span className="state-icon">
        <Icon name="calendar" />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <Icon name={notice.kind === 'success' ? 'check' : 'clock'} />
      <span>{notice.message}</span>
      <button aria-label="Dismiss notification" className="icon-button" onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
}
