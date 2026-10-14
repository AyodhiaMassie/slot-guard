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
  const { api } = useAuth();
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
        title={view === 'browse' ? 'Find a tutor' : 'My appointments'}
        description={
          view === 'browse'
            ? 'Browse tutors and book a 30-minute consultation.'
            : 'View your upcoming appointments and booking history.'
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
                  <p>Loading appointments…</p>
                ) : bookings.error ? (
                  <p role="alert">Unable to load appointments. Select Refresh to try again.</p>
                ) : next ? (
                  <p>
                    <strong>{next.tutor_name}</strong> · {formatDay(next.starts_at)} ·{' '}
                    {timeRange(next.starts_at, next.ends_at)}
                  </p>
                ) : (
                  <p>No upcoming appointments.</p>
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
                <h2>Tutors</h2>
                <span>{tutors.data?.length ?? '—'} tutors</span>
              </div>
              {tutors.loading ? (
                <LoadingState label="Loading tutors…" />
              ) : tutors.error ? (
                <ErrorState message={tutors.error} onRetry={refresh} />
              ) : !tutors.data?.length ? (
                <EmptyState
                  title="No tutors available"
                  message="Check again later for tutor availability."
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
                      <span className="specialty">{tutor.specialty || 'Academic consultations'}</span>
                      <p>{tutor.description || 'Select this tutor to view available times.'}</p>
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
                  title="Tutor availability"
                  message="Select a tutor to view available consultation times."
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
