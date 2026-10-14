import { useMemo, useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useMutation } from '../hooks/useMutation';
import type { Notice } from '../types';
import { dateInput, slotStart, timeZone, validStartTimes } from '../utils/dates';
import { Icon } from './Icon';

export function CreateSlotForm({
  now,
  onRefresh,
  onNotice,
}: {
  now: number;
  onRefresh: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const { api } = useAuth();
  const [date, setDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateInput(tomorrow);
  });
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState('');
  const options = useMemo(() => validStartTimes(date, now), [date, now]);
  const selectedTime = options.includes(time) ? time : (options[0] ?? '');
  const mutation = useMutation();

  function submit(event: FormEvent) {
    event.preventDefault();
    let startsAt: string;
    try {
      startsAt = slotStart(date, selectedTime);
    } catch (error) {
      setError(errorMessage(error));
      return;
    }
    setError('');
    void mutation.run(
      (signal) => api.createSlot(startsAt, signal),
      () => {
        onNotice({
          kind: 'success',
          message: 'Time slot created. Students can now book it.',
        });
        onRefresh();
      },
      (error) => {
        setError(errorMessage(error));
        onRefresh();
      },
    );
  }

  return (
    <section className="panel create-slot-panel">
      <span className="create-icon">
        <Icon name="plus" />
      </span>
      <h2>Create a time slot</h2>
      <p className="muted">Set a date and start time for student bookings.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="slot-date">Appointment date</label>
          <input
            id="slot-date"
            type="date"
            min={dateInput(new Date(now))}
            value={date}
            required
            disabled={mutation.pending}
            onChange={(event) => {
              setDate(event.target.value);
              setError('');
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="slot-time">Start time</label>
          <select
            id="slot-time"
            value={selectedTime}
            required
            disabled={mutation.pending || !options.length}
            onChange={(event) => setTime(event.target.value)}
          >
            {!options.length && <option value="">No valid times on this date</option>}
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="fixed-duration">
          <Icon name="clock" />
          <span>
            <strong>30 minutes</strong>
            <small>Consultation duration</small>
          </span>
          <Icon name="check" />
        </div>
        <p className="timezone-note">Your timezone: {timeZone}</p>
        {error && (
          <p className="inline-alert" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={mutation.pending || !selectedTime}
        >
          {mutation.pending ? 'Creating…' : 'Create time slot'}
          <Icon name="plus" />
        </button>
      </form>
      <p className="form-footnote">
        New slots are available immediately. Booked slots cannot be closed.
      </p>
    </section>
  );
}
