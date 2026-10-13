import { describe, expect, it } from 'vitest';
import {
  dateInput,
  initials,
  isUpcoming,
  localDay,
  slotStart,
  validStartTimes,
} from '../src/utils/dates';
import { appointment } from './fixtures';

describe('local appointment dates and business rules', () => {
  it('offers only future instants on UTC half-hour boundaries', () => {
    const day = '2099-05-12';
    const choices = validStartTimes(day);
    expect(choices).toHaveLength(48);
    for (const time of choices) {
      const instant = slotStart(day, time);
      expect(Date.parse(instant) % 1800000).toBe(0);
      expect(localDay(instant)).toBe(day);
    }
  });
  it('keeps today’s past times out of the form', () => {
    const now = new Date();
    for (const time of validStartTimes(dateInput(now), now.getTime())) {
      expect(Date.parse(slotStart(dateInput(now), time, now.getTime()))).toBeGreaterThan(
        now.getTime(),
      );
    }
  });
  it.each([
    ['2020-01-01', '09:00'],
    ['2099-02-30', '09:00'],
    ['2099-05-12', '25:00'],
    ['', ''],
    ['2099-05-12', '09:01'],
  ])('rejects invalid slot inputs %s %s', (date, time) => {
    expect(() => slotStart(date, time)).toThrow();
  });
  it('keeps cancelled and past bookings out of upcoming appointments', () => {
    expect(isUpcoming(appointment, Date.now())).toBe(true);
    expect(isUpcoming({ ...appointment, status: 'cancelled' }, Date.now())).toBe(false);
    expect(isUpcoming(appointment, Date.parse(appointment.starts_at))).toBe(false);
  });
  it('formats consistent fictional tutor initials', () => {
    expect(initials('Dr Maya Chen')).toBe('MC');
    expect(initials('Alex Morgan')).toBe('AM');
  });
});
