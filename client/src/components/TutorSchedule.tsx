import { useState } from 'react';
import type { TutorSlot } from '../types';
import { formatDateTime, formatDay, timeRange } from '../utils/dates';
import { EmptyState } from './Feedback';

type Filter = 'all' | 'open' | 'booked' | 'closed';
export function TutorSchedule({
  slots,
  now,
  managing,
  onClose,
}: {
  slots: TutorSlot[];
  now: number;
  managing: boolean;
  onClose: (slot: TutorSlot) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showPast, setShowPast] = useState(false);
  const upcoming = slots.filter((slot) => new Date(slot.starts_at).getTime() > now);
  const base = managing && showPast ? slots : upcoming;
  const visible = base
    .filter(
      (slot) =>
        filter === 'all' ||
        (filter === 'booked'
          ? slot.booking_id !== null
          : filter === 'open'
            ? slot.status === 'open' && slot.booking_id === null
            : slot.status === 'closed'),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return (
    <section className="panel schedule-panel">
      <div className="panel-title">
        <h2>{managing ? 'Your availability' : 'Upcoming schedule'}</h2>
        <span className="count-label">{upcoming.length} upcoming slots</span>
      </div>
      <div className="schedule-controls">
        <div className="segmented-control" aria-label="Filter slots">
          {(['all', 'open', 'booked', 'closed'] as const).map((value) => (
            <button
              key={value}
              className={filter === value ? 'selected' : ''}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? 'All slots'
                : value === 'open'
                  ? 'Available'
                  : value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        {managing && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(event) => setShowPast(event.target.checked)}
            />
            Include past slots
          </label>
        )}
      </div>
      {!visible.length ? (
        <EmptyState
          title={filter === 'booked' ? 'Room for a conversation' : 'Nothing on this page yet'}
          message={
            filter === 'booked'
              ? 'Booked students will appear here when they reserve your available times.'
              : 'Create an appointment slot, or choose another filter.'
          }
        />
      ) : (
        <div className="schedule-list">
          {visible.map((slot, index) => {
            const booked = slot.booking_id !== null;
            const future = Date.parse(slot.starts_at) > now;
            const showHeading =
              index === 0 || formatDay(visible[index - 1]!.starts_at) !== formatDay(slot.starts_at);
            return (
              <div key={slot.id}>
                {showHeading && (
                  <h3 className="schedule-date">
                    <time dateTime={slot.starts_at}>{formatDay(slot.starts_at)}</time>
                  </h3>
                )}
                <article className="schedule-row">
                  <div className="schedule-time">
                    <strong>
                      <time dateTime={slot.starts_at}>
                        {timeRange(slot.starts_at, slot.ends_at)}
                      </time>
                    </strong>
                    <span>30-minute consultation</span>
                  </div>
                  <div className="schedule-student">
                    <strong>
                      {booked
                        ? slot.student_name
                        : slot.status === 'closed'
                          ? 'Time removed from availability'
                          : 'Ready for a student'}
                    </strong>
                    <span>
                      {booked
                        ? slot.student_email
                        : slot.status === 'closed'
                          ? 'Students cannot book this time'
                          : 'No booking yet'}
                    </span>
                  </div>
                  <span
                    className={`status-badge ${slot.status === 'closed' ? 'status-closed' : booked ? 'status-booked' : 'status-open'}`}
                  >
                    {slot.status === 'closed'
                      ? 'Closed'
                      : booked
                        ? future
                          ? 'Booked'
                          : 'Completed'
                        : future
                          ? 'Available'
                          : 'Past'}
                  </span>
                  {slot.status === 'open' && !booked && future && (
                    <button
                      className="text-button danger-text"
                      aria-label={`Close slot ${formatDateTime(slot.starts_at)}`}
                      onClick={() => onClose(slot)}
                    >
                      Close slot
                    </button>
                  )}
                </article>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
