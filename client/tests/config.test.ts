import { describe, expect, it } from 'vitest';
import { validateApiBaseUrl } from '../src/api/config';

describe('frontend build API configuration', () => {
  it.each([undefined, 'http://localhost:3000/api', 'http://127.0.0.1:3301/api', 'http://[::1]:3000/api'])
  ('allows local builds with %s', (url) => {
    expect(() => validateApiBaseUrl(url, false)).not.toThrow();
  });
  it('accepts a hosted HTTPS API without trailing-slash ambiguity', () => {
    expect(() => validateApiBaseUrl('https://slotguard-api.example/api', true)).not.toThrow();
    expect(() => validateApiBaseUrl('https://slotguard-api.example/api/', true)).not.toThrow();
  });
  it.each([undefined, 'http://localhost:3000/api', 'https://replace-backend-host.invalid/api',
    'http://slotguard-api.example/api', 'https://user:secret@slotguard-api.example/api',
    'https://slotguard-api.example', 'https://slotguard-api.example/api?token=secret',
    'https://slotguard-api.example/api#fragment', 'not-a-url'])
  ('rejects unsafe or incomplete hosted API configuration %s', (url) => {
    expect(() => validateApiBaseUrl(url, true)).toThrow();
  });
});
