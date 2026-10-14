import { useCallback, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useClock } from '../hooks/useClock';
import { useMutation } from '../hooks/useMutation';
import { useResource } from '../hooks/useResource';
import type { Notice, Slot, Tutor } from '../types';
import { formatDateTime, formatDay, initials, localDay, timeRange, timeZone } from '../utils/dates';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import { Icon } from './Icon';

export function AvailabilityPanel({
  tutor,
  version,
  onRefresh,
  onNotice,
}: {
  tutor: Tutor;
  version: number;
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const { api } = useAuth();
  const now = useClock();
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => api.availableSlots(tutor.id, signal),
      [api, tutor.id, version],
    ),
  );
  const [chosenDay, setChosenDay] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const mutation = useMutation();
  const futureSlots = (resource.data ?? []).filter(
    (slot) => new Date(slot.starts_at).getTime() > now,
  );
  const days = [...new Set(futureSlots.map((slot) => localDay(slot.starts_at)))];
  const activeDay = days.includes(chosenDay) ? chosenDay : days[0];
  const daySlots = futureSlots.filter((slot) => localDay(slot.starts_at) === activeDay);

  function confirmBooking() {
    if (!selectedSlot) return;
    void mutation.run(
      (signal) => api.book(selectedSlot.id, signal),
      () => {
        setSelectedSlot(null);
        onNotice({
          kind: 'success',
          message: `Appointment confirmed with ${tutor.name}. View it in My appointments.`,
        });
        onRefresh();
      },
      (error) => {
        setSelectedSlot(null);
        onNotice({
          kind: 'error',
          message:
            error instanceof ApiError && error.status === 409
              ? 'That slot is no longer available. Choose another time.'
              : errorMessage(error),
        });
        onRefresh();
      },
    );
  }

  return (
    <section className="panel availability-panel" aria-label={`Availability for ${tutor.name}`}>
      <div className="tutor-detail-heading">
        <span className="avatar avatar-large">{initials(tutor.name)}</span>
        <div>
          <h2>{tutor.name}</h2>
          <p>{tutor.specialty || 'Academic consultations'}</p>
        </div>
      </div>
      <p className="tutor-bio">
        {tutor.description || 'Select an available time to book a consultation.'}
      </p>
      <div className="section-divider" />
      <div className="panel-subheading">
        <h3>Choose a time</h3>
        <span className="duration-pill">
          <Icon name="clock" />
          30 minutes
        </span>
      </div>
      <p className="timezone-note">All times in {timeZone}</p>
      {resource.loading ? (
        <LoadingState label="Loading available times…" />
      ) : resource.error ? (
        <ErrorState message={resource.error} onRetry={onRefresh} />
      ) : !futureSlots.length ? (
        <EmptyState
          title="No available time slots"
          message="Select another tutor or check again later."
        />
      ) : (
        <>
          <div className="date-picker" aria-label="Choose an appointment date">
            {days.map((day) => {
              const instant = futureSlots.find(
                (slot) => localDay(slot.starts_at) === day,
              )!.starts_at;
              return (
                <button
                  key={day}
                  className={`date-button ${day === activeDay ? 'selected' : ''}`}
                  aria-pressed={day === activeDay}
                  onClick={() => setChosenDay(day)}
                >
                  {formatDay(instant)}
                </button>
              );
            })}
          </div>
          <div className="time-picker">
            {daySlots.map((slot) => (
              <button
                className="time-button"
                key={slot.id}
                aria-label={`Book ${formatDateTime(slot.starts_at)}`}
                onClick={() => setSelectedSlot(slot)}
              >
                <Icon name="clock" />
                <time dateTime={slot.starts_at}>{timeRange(slot.starts_at, slot.ends_at)}</time>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          <p className="booking-hint">
            <Icon name="shield" />
            Select a time to review and confirm your consultation.
          </p>
        </>
      )}
      {selectedSlot && (
        <ConfirmDialog
          title="Confirm booking"
          confirmLabel="Confirm booking"
          pending={mutation.pending}
          onConfirm={confirmBooking}
          onClose={() => setSelectedSlot(null)}
        >
          <p className="muted">Consultation with {tutor.name}.</p>
          <div className="confirmation-summary">
            <strong>{formatDateTime(selectedSlot.starts_at)}</strong>
            <span>{timeRange(selectedSlot.starts_at, selectedSlot.ends_at)} · 30 minutes</span>
            <span>{timeZone}</span>
          </div>
          <p className="dialog-note">
            You can cancel from My appointments before the consultation starts.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
