import { useCallback, useState } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { WorkspaceView } from '../components/AppShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateSlotForm } from '../components/CreateSlotForm';
import { ErrorState, LoadingState, NoticeBar } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { TutorSchedule } from '../components/TutorSchedule';
import { useClock } from '../hooks/useClock';
import { useMutation } from '../hooks/useMutation';
import { useResource } from '../hooks/useResource';
import type { Notice, TutorSlot } from '../types';
import { formatDateTime } from '../utils/dates';

export function TutorDashboard({ view }: { view: WorkspaceView }) {
  const { api } = useAuth();
  const now = useClock();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [target, setTarget] = useState<TutorSlot | null>(null);
  const slots = useResource(
    useCallback((signal: AbortSignal) => api.mySlots(signal), [api, version]),
  );
  const mutation = useMutation();
  const refresh = () => setVersion((value) => value + 1);
  const upcoming = (slots.data ?? []).filter((slot) => Date.parse(slot.starts_at) > now);
  const booked = upcoming.filter((slot) => slot.booking_id !== null).length;
  const available = upcoming.filter(
    (slot) => slot.status === 'open' && slot.booking_id === null,
  ).length;

  function confirmClose() {
    if (!target) return;
    void mutation.run(
      (signal) => api.closeSlot(target.id, signal),
      () => {
        setTarget(null);
        setNotice({
          kind: 'success',
          message: 'Time slot closed. Students can no longer book it.',
        });
        refresh();
      },
      (error) => {
        setTarget(null);
        setNotice({ kind: 'error', message: errorMessage(error) });
        refresh();
      },
    );
  }

  return (
    <>
      <PageHeading
        title={
          view === 'schedule' ? 'Manage your consultations' : 'Manage availability'
        }
        description={
          view === 'schedule'
            ? 'View upcoming consultations and student bookings.'
            : 'Create 30-minute consultation slots or close unbooked times.'
        }
        onRefresh={refresh}
      />
      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
      <div className="summary-grid">
        <div className="summary-card">
          <span className="summary-icon">
            <Icon name="calendar" />
          </span>
          <div>
            <span>Upcoming consultations</span>
            <strong>
              {slots.loading || slots.error ? '—' : booked.toString().padStart(2, '0')}
            </strong>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-icon">
            <Icon name="clock" />
          </span>
          <div>
            <span>Available time slots</span>
            <strong>
              {slots.loading || slots.error ? '—' : available.toString().padStart(2, '0')}
            </strong>
          </div>
        </div>
        <div className="summary-card summary-note">
          <Icon name="book" />
          <p>
            Consultation length
            <br />
            <strong>30 minutes</strong>
          </p>
        </div>
      </div>
      <div className={view === 'availability' ? 'tutor-layout' : ''}>
        {view === 'availability' && (
          <CreateSlotForm now={now} onRefresh={refresh} onNotice={setNotice} />
        )}
        <div>
          {slots.loading ? (
            <section className="panel">
              <LoadingState label="Loading your schedule…" />
            </section>
          ) : slots.error ? (
            <section className="panel">
              <ErrorState message={slots.error} onRetry={refresh} />
            </section>
          ) : (
            <TutorSchedule
              slots={slots.data ?? []}
              now={now}
              managing={view === 'availability'}
              onClose={setTarget}
            />
          )}
        </div>
      </div>
      {target && (
        <ConfirmDialog
          title="Close this time slot?"
          confirmLabel="Close slot"
          dismissLabel="Keep slot open"
          destructive
          pending={mutation.pending}
          onConfirm={confirmClose}
          onClose={() => setTarget(null)}
        >
          <p className="muted">Students will no longer be able to book this time.</p>
          <div className="confirmation-summary">
            <strong>{formatDateTime(target.starts_at)}</strong>
            <span>30-minute consultation</span>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
