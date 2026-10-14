import { useState } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useMutation } from '../hooks/useMutation';
import type { Appointment, Notice } from '../types';
import { formatDateTime, formatDay, initials, isUpcoming, timeRange } from '../utils/dates';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import { Icon } from './Icon';

export function StudentAppointments({
  appointments,
  loading,
  error,
  now,
  onRefresh,
  onNotice,
  onBrowse,
}: {
  appointments: Appointment[] | null;
  loading: boolean;
  error: string | null;
  now: number;
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
  onBrowse: () => void;
}) {
  const { api } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [target, setTarget] = useState<Appointment | null>(null);
  const mutation = useMutation();
  const upcoming = (appointments ?? [])
    .filter((appointment) => isUpcoming(appointment, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const history = (appointments ?? []).filter((appointment) => !isUpcoming(appointment, now));
  const visible = tab === 'upcoming' ? upcoming : history;

  function confirmCancel() {
    if (!target) return;
    void mutation.run(
      (signal) => api.cancel(target.id, signal),
      () => {
        setTarget(null);
        onNotice({
          kind: 'success',
          message:
            'Appointment cancelled. You can view it in History.',
        });
        onRefresh();
      },
      (error) => {
        setTarget(null);
        onNotice({ kind: 'error', message: errorMessage(error) });
        onRefresh();
      },
    );
  }

  return (
    <section className="panel appointments-panel">
      <div className="panel-title">
        <h2>Appointments</h2>
        <button className="text-button" onClick={onBrowse}>
          Find a tutor
          <Icon name="arrow" />
        </button>
      </div>
      <div className="segmented-control" aria-label="Appointment view">
        <button
          aria-pressed={tab === 'upcoming'}
          className={tab === 'upcoming' ? 'selected' : ''}
          onClick={() => setTab('upcoming')}
        >
          Upcoming <span>{upcoming.length}</span>
        </button>
        <button
          aria-pressed={tab === 'history'}
          className={tab === 'history' ? 'selected' : ''}
          onClick={() => setTab('history')}
        >
          History <span>{history.length}</span>
        </button>
      </div>
      {loading ? (
        <LoadingState label="Loading appointments…" />
      ) : error ? (
        <ErrorState message={error} onRetry={onRefresh} />
      ) : !visible.length ? (
        <EmptyState
          title={tab === 'upcoming' ? 'No upcoming appointments' : 'No appointment history'}
          message={
            tab === 'upcoming'
              ? 'Find a tutor and select an available time.'
              : 'Past and cancelled appointments appear here.'
          }
        />
      ) : (
        <div className="appointment-list">
          {visible.map((appointment) => (
            <article className="appointment-card" key={appointment.id}>
              <span className="avatar">{initials(appointment.tutor_name)}</span>
              <div className="appointment-person">
                <h3>{appointment.tutor_name}</h3>
                <p>{appointment.tutor_specialty || 'Academic consultations'}</p>
              </div>
              <div className="appointment-time">
                <strong>
                  <time dateTime={appointment.starts_at}>{formatDay(appointment.starts_at)}</time>
                </strong>
                <span>{timeRange(appointment.starts_at, appointment.ends_at)}</span>
              </div>
              <span
                className={`status-badge ${appointment.status === 'cancelled' ? 'status-closed' : tab === 'upcoming' ? 'status-booked' : 'status-past'}`}
              >
                {appointment.status === 'cancelled'
                  ? 'Cancelled'
                  : tab === 'upcoming'
                    ? 'Confirmed'
                    : 'Past'}
              </span>
              {isUpcoming(appointment, now) && (
                <button
                  className="text-button danger-text"
                  onClick={() => setTarget(appointment)}
                  aria-label={`Cancel appointment with ${appointment.tutor_name}`}
                >
                  Cancel
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {target && (
        <ConfirmDialog
          title="Cancel this appointment?"
          confirmLabel="Cancel appointment"
          dismissLabel="Keep appointment"
          pending={mutation.pending}
          destructive
          onConfirm={confirmCancel}
          onClose={() => setTarget(null)}
        >
          <p className="muted">This releases the time for another student.</p>
          <div className="confirmation-summary">
            <strong>{target.tutor_name}</strong>
            <span>{formatDateTime(target.starts_at)}</span>
          </div>
          <p className="dialog-note">The appointment will remain in your history.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
