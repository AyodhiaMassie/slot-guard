import { useCallback, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { AvailabilityPanel } from '../components/AvailabilityPanel';
import { EmptyState, ErrorState, LoadingState, NoticeBar } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { StudentAppointments } from '../components/StudentAppointments';
import type { WorkspaceView } from '../components/AppShell';
import { useClock } from '../hooks/useClock';
import { useResource } from '../hooks/useResource';
import type { Notice } from '../types';
import { formatDay, initials, isUpcoming, timeRange } from '../utils/dates';

export function StudentDashboard({
  view,
  onNavigate,
}: {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const { api, user } = useAuth();
  const now = useClock();
  const [version, setVersion] = useState(0);
  const [selectedTutorId, setSelectedTutorId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const refresh = () => setVersion((value) => value + 1);
  const tutors = useResource(
    useCallback((signal: AbortSignal) => api.tutors(signal), [api, version]),
  );
  const bookings = useResource(
    useCallback((signal: AbortSignal) => api.myBookings(signal), [api, version]),
  );
  const selectedTutor =
    tutors.data?.find((tutor) => tutor.id === selectedTutorId) ?? tutors.data?.[0];
  const upcoming = (bookings.data ?? [])
    .filter((appointment) => isUpcoming(appointment, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = upcoming[0];

  return (
    <>
      <PageHeading
        eyebrow={`A LITTLE SPACE FOR YOUR NEXT STEP, ${user?.name.split(' ')[0]?.toUpperCase()}`}
        title={
          view === 'browse'
            ? 'Good guidance starts with a conversation.'
            : 'Your time, thoughtfully planned.'
        }
        description={
          view === 'browse'
            ? 'Find the right tutor. Choose a time. Leave with a clearer direction.'
            : 'Keep track of what’s ahead and the conversations you’ve had.'
        }
        onRefresh={refresh}
      />
      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
      {view === 'browse' ? (
        <>
          <div className="student-overview">
            <div className="overview-copy">
              <span className="overview-icon">
                <Icon name="calendar" />
              </span>
              <div>
                <span className="eyebrow">YOUR NEXT APPOINTMENT</span>
                {bookings.loading ? (
                  <p>Loading your appointments…</p>
                ) : bookings.error ? (
                  <p role="alert">Appointments could not load. Use Refresh to try again.</p>
                ) : next ? (
                  <p>
                    <strong>{next.tutor_name}</strong> · {formatDay(next.starts_at)} ·{' '}
                    {timeRange(next.starts_at, next.ends_at)}
                  </p>
                ) : (
                  <p>A clear next step is one conversation away.</p>
                )}
              </div>
            </div>
            <button className="text-button" onClick={() => onNavigate('appointments')}>
              My appointments <Icon name="arrow" />
            </button>
          </div>
          <div className="booking-layout">
            <section className="tutor-directory">
              <div className="directory-heading">
                <h2>Find your tutor</h2>
                <span>{tutors.data?.length ?? '—'} tutors</span>
              </div>
              <p className="muted directory-description">A familiar face for your next question.</p>
              {tutors.loading ? (
                <LoadingState label="Loading the tutor directory…" />
              ) : tutors.error ? (
                <ErrorState message={tutors.error} onRetry={refresh} />
              ) : !tutors.data?.length ? (
                <EmptyState
                  title="No tutors yet"
                  message="Check back soon for new consultation availability."
                />
              ) : (
                <div className="tutor-list">
                  {tutors.data.map((tutor) => (
                    <button
                      className={`tutor-card ${selectedTutor?.id === tutor.id ? 'selected' : ''}`}
                      aria-pressed={selectedTutor?.id === tutor.id}
                      aria-label={`View ${tutor.name} availability`}
                      key={tutor.id}
                      onClick={() => setSelectedTutorId(tutor.id)}
                    >
                      <div className="tutor-card-top">
                        <span className="avatar">{initials(tutor.name)}</span>
                        <span className="tutor-select-icon">
                          <Icon name="arrow" />
                        </span>
                      </div>
                      <h3>{tutor.name}</h3>
                      <span className="specialty">{tutor.specialty || 'Academic guidance'}</span>
                      <p>{tutor.description || 'Support for your academic next steps.'}</p>
                      <span
                        className={`availability-count ${tutor.available_slot_count ? '' : 'unavailable-count'}`}
                      >
                        <span className="online-dot" />
                        {tutor.available_slot_count
                          ? `${tutor.available_slot_count} available ${tutor.available_slot_count === 1 ? 'slot' : 'slots'}`
                          : 'No upcoming availability'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {selectedTutor ? (
              <AvailabilityPanel
                key={selectedTutor.id}
                tutor={selectedTutor}
                version={version}
                onRefresh={refresh}
                onNotice={setNotice}
              />
            ) : (
              <section className="panel availability-panel">
                <EmptyState
                  title="A time for you"
                  message="Choose a tutor to explore their available consultations."
                />
              </section>
            )}
          </div>
        </>
      ) : (
        <StudentAppointments
          appointments={bookings.data}
          loading={bookings.loading}
          error={bookings.error}
          now={now}
          onRefresh={refresh}
          onNotice={setNotice}
          onBrowse={() => onNavigate('browse')}
        />
      )}
    </>
  );
}
