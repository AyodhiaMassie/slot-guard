import type { Appointment, Booking, LoginResponse, Slot, Tutor, TutorSlot, User } from '../types';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  token?: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
  onUnauthorized?: (() => void) | undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  // Free hosting can take about a minute to wake; allow the initial request to finish.
  const timeout = setTimeout(cancel, 90000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.status === 401 && options.token) options.onUnauthorized?.();
    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      error?: { message?: string; code?: string; details?: { message: string }[] };
    } | null;
    if (!response.ok) {
      const details = payload?.error?.details?.map((detail) => detail.message).join(' ');
      throw new ApiError(
        response.status,
        details || payload?.error?.message || 'The request could not be completed.',
        payload?.error?.code,
      );
    }
    if (!payload || !('data' in payload))
      throw new ApiError(502, 'SlotGuard returned an unexpected response. Please try again.');
    return payload.data as T;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    // A disconnected response does not prove a mutation failed; refresh before repeating it.
    throw new ApiError(
      0,
      'Connection interrupted. The service may be starting. Refresh to check the latest state before trying again.',
      'CONNECTION_ERROR',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function createApi(token: string, onUnauthorized: () => void) {
  const read = <T>(path: string, signal?: AbortSignal) =>
    apiRequest<T>(path, { token, signal, onUnauthorized });
  const mutate = <T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal) =>
    apiRequest<T>(path, { token, method, body, signal, onUnauthorized });
  async function listAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const results: T[] = [];
    // The backend paginates history newest-first; read every page so older upcoming slots are not hidden.
    for (let offset = 0; offset <= 1000000; offset += 100) {
      const page = await read<T[]>(`${path}?limit=100&offset=${offset}`, signal);
      results.push(...page);
      if (page.length < 100) return results;
    }
    throw new ApiError(400, 'This schedule is too large to load.');
  }
  return {
    tutors: (signal?: AbortSignal) => listAll<Tutor>('/tutors', signal),
    availableSlots: (id: number, signal?: AbortSignal) =>
      listAll<Slot>(`/tutors/${id}/slots`, signal),
    mySlots: (signal?: AbortSignal) => listAll<TutorSlot>('/slots/mine', signal),
    myBookings: (signal?: AbortSignal) => listAll<Appointment>('/bookings/mine', signal),
    book: (slotId: number, signal?: AbortSignal) =>
      mutate<Booking>('/bookings', 'POST', { slot_id: slotId }, signal),
    cancel: (bookingId: number, signal?: AbortSignal) =>
      mutate<Booking>(`/bookings/${bookingId}/cancel`, 'PATCH', {}, signal),
    createSlot: (startsAt: string, signal?: AbortSignal) =>
      mutate<Slot>('/slots', 'POST', { starts_at: startsAt }, signal),
    closeSlot: (slotId: number, signal?: AbortSignal) =>
      mutate<Slot>(`/slots/${slotId}/close`, 'PATCH', {}, signal),
  };
}

export function loginRequest(
  email: string,
  password: string,
  signal?: AbortSignal,
): Promise<LoginResponse> {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
    signal,
  });
}

export function profileRequest(token: string, signal?: AbortSignal): Promise<User> {
  return apiRequest('/auth/me', { token, signal });
}
