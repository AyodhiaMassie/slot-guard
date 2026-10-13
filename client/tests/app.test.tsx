import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';
import { dateInput, timeZone } from '../src/utils/dates';
import type { Appointment, Slot, TutorSlot } from '../src/types';
import {
  appointment,
  json,
  ownSlot,
  saveSession,
  secondSlot,
  slot,
  student,
  tutor,
  tutors,
} from './fixtures';

let available: Slot[];
let history: Appointment[];
let tutorSlots: TutorSlot[];
let override:
  ((path: string, init: RequestInit) => Promise<Response> | Response | undefined) | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  available = [slot, secondSlot];
  history = [];
  tutorSlots = [ownSlot];
  override = undefined;
  fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const path = url.pathname;
    const alternate = override?.(path, init);
    if (alternate) return alternate;
    const user =
      (init.headers as Record<string, string>)?.Authorization === 'Bearer tutor-token'
        ? tutor
        : student;
    if (path === '/api/auth/login') {
      const body = JSON.parse(String(init.body)) as { email: string; password: string };
      if (body.password === 'wrong')
        return json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } },
          401,
        );
      const profile = body.email.includes('.tutor@') ? tutor : student;
      return json({ data: { token: `${profile.role}-token`, expires_in: 3600, user: profile } });
    }
    if (path === '/api/auth/me') return json({ data: user });
    if (path === '/api/tutors') return json({ data: tutors });
    if (/\/api\/tutors\/\d+\/slots/.test(path))
      return json({ data: path.includes('/3/') ? available : [] });
    if (path === '/api/bookings/mine') return json({ data: history });
    if (path === '/api/slots/mine') return json({ data: tutorSlots });
    if (path === '/api/bookings' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { slot_id: number };
      const selected = available.find((record) => record.id === body.slot_id)!;
      history = [
        {
          ...appointment,
          slot_id: selected.id,
          starts_at: selected.starts_at,
          ends_at: selected.ends_at,
        },
      ];
      available = available.filter((record) => record.id !== body.slot_id);
      return json({ data: history[0] }, 201);
    }
    if (/\/api\/bookings\/\d+\/cancel/.test(path)) {
      history = history.map((record) => ({
        ...record,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      }));
      available = [slot, secondSlot];
      return json({ data: history[0] });
    }
    if (path === '/api/slots' && init.method === 'POST') {
      const { starts_at } = JSON.parse(String(init.body)) as { starts_at: string };
      const created = {
        ...ownSlot,
        id: 12,
        starts_at,
        ends_at: new Date(Date.parse(starts_at) + 1800000).toISOString(),
      };
      tutorSlots = [...tutorSlots, created];
      return json({ data: created }, 201);
    }
    if (/\/api\/slots\/\d+\/close/.test(path)) {
      tutorSlots = tutorSlots.map((record) => ({ ...record, status: 'closed' }));
      return json({ data: tutorSlots[0] });
    }
    throw new Error(`Unexpected test request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}
async function authenticated(role: 'student' | 'tutor' = 'student') {
  saveSession(role);
  renderApp();
  await screen.findByRole('navigation', { name: 'Main navigation' });
}
async function selectSlot() {
  const buttons = await screen.findAllByRole('button', { name: /^Book / });
  await userEvent.click(buttons[0]!);
  return screen.getByRole('dialog');
}

describe('login and session lifecycle', () => {
  it('displays four demo accounts and signs into the Student workspace', async () => {
    renderApp();
    expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Use Alex (Student)' }));
    expect(screen.getByLabelText('Email address')).toHaveValue(student.email);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Find a tutor' });
    expect(sessionStorage.getItem('slotguard.session')).toContain('student-token');
    expect(screen.queryByRole('button', { name: 'Manage availability' })).not.toBeInTheDocument();
  });
  it('handles invalid input and incorrect credentials', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
    await userEvent.type(screen.getByLabelText('Email address'), student.email);
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(sessionStorage.getItem('slotguard.session')).toBeNull();
  });
  it('signs into the Tutor workspace with role-specific navigation', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Use Maya (Tutor)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Manage availability' });
    expect(screen.queryByRole('button', { name: 'Find a tutor' })).not.toBeInTheDocument();
  });
  it('restores the profile from the server and clears state on logout', async () => {
    await authenticated();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('slotguard.session')).toBeNull();
  });
  it('clears a saved session rejected by the server', async () => {
    override = (path) =>
      path === '/api/auth/me' ? json({ error: { message: 'Invalid token' } }, 401) : undefined;
    saveSession();
    renderApp();
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired');
    expect(sessionStorage.getItem('slotguard.session')).toBeNull();
  });
  it('expires a session during an authenticated API request', async () => {
    override = (path) =>
      path === '/api/tutors' ? json({ error: { message: 'Expired' } }, 401) : undefined;
    saveSession();
    renderApp();
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired');
  });
  it('expires idle sessions without waiting for another request', async () => {
    vi.useFakeTimers();
    saveSession('student', Date.now() + 500);
    renderApp();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
    });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('slotguard.session')).toBeNull();
  });
  it('offers a retry when restoring a session cannot reach the service', async () => {
    let unavailable = true;
    override = (path) =>
      path === '/api/auth/me' && unavailable
        ? Promise.reject(new TypeError('Network error'))
        : undefined;
    saveSession();
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    unavailable = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('navigation');
  });
  it('keeps a new account signed in after an earlier account receives a delayed 401', async () => {
    let complete: ((response: Response) => void) | undefined;
    override = (path) => path === '/api/tutors'
      ? new Promise<Response>((resolve) => { complete = resolve; }) : undefined;
    await authenticated();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use Maya (Tutor)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Manage availability' });
    await act(async () => { complete!(json({ error: { message: 'Expired' } }, 401)); });
    expect(screen.getByRole('button', { name: 'Manage availability' })).toBeInTheDocument();
    expect(sessionStorage.getItem('slotguard.session')).toContain('tutor-token');
  });
});

describe('Student booking and cancellation', () => {
  it('displays tutor availability, local timezone, and a helpful empty state', async () => {
    await authenticated();
    expect(await screen.findByText('2 available slots')).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(timeZone))).not.toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'View Dr Noah Patel availability' }));
    expect(await screen.findByText('No times available yet')).toBeInTheDocument();
  });
  it('ignores delayed availability from the previously selected tutor', async () => {
    let complete: ((response: Response) => void) | undefined;
    override = (path) => path === '/api/tutors/3/slots'
      ? new Promise<Response>((resolve) => { complete = resolve; }) : undefined;
    await authenticated();
    await screen.findByText('Finding available times…');
    await userEvent.click(screen.getByRole('button', { name: 'View Dr Noah Patel availability' }));
    await screen.findByText('No times available yet');
    await act(async () => { complete!(json({ data: available })); });
    expect(screen.getByText('No times available yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Book / })).not.toBeInTheDocument();
  });
  it('waits for API confirmation before reporting a booking and refreshes appointments', async () => {
    let complete: ((response: Response) => void) | undefined;
    override = (path, init) =>
      path === '/api/bookings' && init.method === 'POST'
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : undefined;
    await authenticated();
    const dialog = await selectSlot();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }));
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.queryByText(/You're booked with/)).not.toBeInTheDocument();
    history = [appointment];
    available = [secondSlot];
    await act(async () => {
      complete!(json({ data: appointment }, 201));
    });
    expect(await screen.findByText(/You're booked with/)).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'My appointments' }),
    );
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(tutor.name)).toBeInTheDocument();
  });
  it('handles 409 conflicts without a false confirmation and refreshes available slots', async () => {
    override = (path, init) => {
      if (path === '/api/bookings' && init.method === 'POST') {
        available = [secondSlot];
        return json(
          { error: { code: 'SLOT_UNAVAILABLE', message: 'This slot is no longer available.' } },
          409,
        );
      }
      return undefined;
    };
    await authenticated();
    const dialog = await selectSlot();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That slot is no longer available');
    expect(await screen.findAllByRole('button', { name: /^Book / })).toHaveLength(1);
    expect(history).toHaveLength(0);
  });
  it('returns focus to the workspace when a booking refresh removes the dialog trigger', async () => {
    await authenticated();
    const dialog = await selectSlot();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm booking' }));
    await screen.findByText(/You're booked with/);
    await waitFor(() => expect(document.getElementById('main-content')).toHaveFocus());
  });
  it('cancels through the API, preserves history, and refreshes availability', async () => {
    history = [appointment];
    available = [secondSlot];
    await authenticated();
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'My appointments' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: `Cancel appointment with ${tutor.name}` }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel appointment' }),
    );
    expect(await screen.findByText(/Appointment cancelled/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^History/ }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Find a tutor' }),
    );
    expect(await screen.findAllByRole('button', { name: /^Book / })).toHaveLength(2);
  });
  it('keeps past appointments in history with no cancellation action', async () => {
    history = [
      { ...appointment, starts_at: '2020-01-01T09:00:00Z', ends_at: '2020-01-01T09:30:00Z' },
    ];
    await authenticated();
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'My appointments' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^History/ }));
    expect(await screen.findByText('Past')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancel appointment/ })).not.toBeInTheDocument();
  });
  it('shows loading, service errors, and recovery without fabricated availability', async () => {
    let complete: ((response: Response) => void) | undefined;
    override = (path) =>
      path === '/api/tutors'
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : undefined;
    await authenticated();
    expect(screen.getByText('Loading the tutor directory…')).toBeInTheDocument();
    await act(async () => {
      complete!(json({ error: { message: 'Service unavailable' } }, 500));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    override = undefined;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 available slots')).toBeInTheDocument();
  });
  it('supports keyboard dismissal and restores dialog focus', async () => {
    await authenticated();
    const trigger = (await screen.findAllByRole('button', { name: /^Book / }))[0]!;
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('Tutor availability management', () => {
  it('shows booked students and excludes booking and closure controls for their reservations', async () => {
    tutorSlots = [
      {
        ...ownSlot,
        booking_id: appointment.id,
        booking_status: 'confirmed',
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
      },
    ];
    await authenticated('tutor');
    expect(await screen.findByText(student.name)).toBeInTheDocument();
    expect(screen.getByText(student.email)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close slot / })).not.toBeInTheDocument();
  });
  it('creates a fixed-duration slot using a local datetime converted to UTC', async () => {
    await authenticated('tutor');
    await userEvent.click(screen.getByRole('button', { name: 'Manage availability' }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(screen.getByLabelText('Appointment date')).toHaveValue(dateInput(tomorrow));
    await userEvent.click(screen.getByRole('button', { name: 'Create appointment slot' }));
    expect(await screen.findByText(/Your new consultation time/)).toBeInTheDocument();
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => init.method === 'POST' && String(init.body).includes('starts_at'),
    );
    const payload = JSON.parse(mutation![1].body) as { starts_at: string };
    expect(Date.parse(payload.starts_at) % 1800000).toBe(0);
    expect(Object.keys(payload)).toEqual(['starts_at']);
  });
  it('shows duplicate-slot conflicts from the backend', async () => {
    override = (path, init) =>
      path === '/api/slots' && init.method === 'POST'
        ? json({ error: { message: 'The slot or reservation already exists.' } }, 409)
        : undefined;
    await authenticated('tutor');
    await userEvent.click(screen.getByRole('button', { name: 'Manage availability' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create appointment slot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
  it('closes only an unbooked slot and refreshes its status', async () => {
    await authenticated('tutor');
    await userEvent.click(await screen.findByRole('button', { name: /^Close slot / }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close appointment slot' }),
    );
    expect(await screen.findByText(/Slot closed/)).toBeInTheDocument();
    expect(await screen.findByText('Time removed from availability')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close slot / })).not.toBeInTheDocument();
  });
});
