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
          message: 'Slot closed. It has been removed from student availability.',
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
        eyebrow="A LITTLE TIME CAN MAKE A BIG DIFFERENCE"
        title={
          view === 'schedule' ? 'Make room for their next step.' : 'A schedule that works for you.'
        }
        description={
          view === 'schedule'
            ? 'Your upcoming conversations, and the students looking forward to them.'
            : 'Publish a new time or close an unbooked slot. Every consultation lasts 30 minutes.'
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
            <span>Available times</span>
            <strong>
              {slots.loading || slots.error ? '—' : available.toString().padStart(2, '0')}
            </strong>
          </div>
        </div>
        <div className="summary-card summary-note">
          <Icon name="book" />
          <p>
            One conversation.
            <br />
            <strong>A world of possibility.</strong>
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
              <LoadingState />
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
          title="Close this consultation time?"
          confirmLabel="Close appointment slot"
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
