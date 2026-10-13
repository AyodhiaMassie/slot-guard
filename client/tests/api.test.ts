import { describe, expect, it, vi } from 'vitest';
import { apiRequest, createApi } from '../src/api/client';
import { json, tutors } from './fixtures';

describe('Fetch API client', () => {
  it('sends Bearer authentication and the documented JSON booking body', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ data: { id: 1 } }, 201));
    vi.stubGlobal('fetch', fetch);
    await createApi('session-token', vi.fn()).book(12);
    expect(fetch.mock.calls[0]![0]).toMatch(/\/api\/bookings$/);
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
      body: '{"slot_id":12}',
    });
  });
  it('loads all pages instead of hiding records beyond the API default limit', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: Array.from({ length: 100 }, (_, id) => ({ ...tutors[0], id })) }),
      )
      .mockResolvedValueOnce(json({ data: [{ ...tutors[0], id: 101 }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await createApi('token', vi.fn()).tutors()).toHaveLength(101);
    expect(fetch.mock.calls[1]![0]).toContain('offset=100');
  });
  it('notifies session expiry only for protected 401s', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(json({ error: { message: 'Invalid credentials' } }, 401)),
        ),
    );
    const expired = vi.fn();
    await expect(apiRequest('/auth/login', { onUnauthorized: expired })).rejects.toMatchObject({
      status: 401,
    });
    expect(expired).not.toHaveBeenCalled();
    await expect(createApi('token', expired).myBookings()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });
  it('preserves conflict status and useful validation details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid input',
                details: [{ message: 'Slots must start in the future.' }],
              },
            },
            400,
          ),
        ),
    );
    await expect(createApi('token', vi.fn()).createSlot('invalid')).rejects.toMatchObject({
      status: 400,
      message: 'Slots must start in the future.',
    });
  });
  it('rejects malformed server responses and distinguishes connection failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>wrong server</html>'))
      .mockRejectedValueOnce(new TypeError('Network failed'));
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('/health')).rejects.toMatchObject({ status: 502 });
    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 0,
      code: 'CONNECTION_ERROR',
    });
  });
  it('aborts in-flight reads on cleanup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }: RequestInit) =>
          new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    );
    const controller = new AbortController();
    const read = apiRequest('/tutors', { signal: controller.signal });
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  });
});
