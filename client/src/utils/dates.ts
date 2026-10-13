import type { Appointment } from '../types';

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export function formatDay(value: string | number | Date): string {
  return dayFormatter.format(new Date(value));
}
export function formatTime(value: string | number | Date): string {
  return timeFormatter.format(new Date(value));
}
export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
export function dateInput(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function localDay(value: string): string {
  return dateInput(new Date(value));
}
export function timeRange(start: string, end?: string): string {
  return `${formatTime(start)} – ${formatTime(end ?? new Date(new Date(start).getTime() + 1800000))}`;
}
export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
export function isUpcoming(appointment: Appointment, now: number): boolean {
  return appointment.status === 'confirmed' && new Date(appointment.starts_at).getTime() > now;
}

export function slotStart(date: string, time: string, now = Date.now()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Choose a date and start time.');
  const start = new Date(`${date}T${time}:00`);
  if (
    !Number.isFinite(start.getTime()) ||
    dateInput(start) !== date ||
    formatTime(start) !== time
  ) {
    throw new Error('That local time does not exist. Choose another start time.');
  }
  if (start.getTime() <= now) throw new Error('Choose a start time in the future.');
  if (start.getTime() % 1800000 !== 0)
    throw new Error('Choose one of the available 30-minute start times.');
  return start.toISOString();
}

export function validStartTimes(date: string, now = Date.now()): string[] {
  const times: string[] = [];
  // Filter local times against UTC boundaries to support quarter-hour zones and DST gaps.
  for (let minute = 0; minute < 1440; minute += 1) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    try {
      slotStart(date, time, now);
      times.push(time);
    } catch {
      continue;
    }
  }
  return times;
}
