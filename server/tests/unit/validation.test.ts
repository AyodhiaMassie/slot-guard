import { describe, expect, it } from 'vitest';
import { createBookingSchema, createSlotSchema, idParameterSchema, loginSchema, paginationSchema, validate } from '../../src/validation.js';
import { loadConfig } from '../../src/config.js';
import { validateTestDatabaseUrl } from '../helpers/test-database.js';

const future = new Date('2099-05-12T09:00:00.000Z');

describe('request validation', () => {
  it('normalizes email and accepts a valid credential body', () => {
    expect(validate(loginSchema, { email: ' Alex@Example.com ', password: 'secret' }).email).toBe('alex@example.com');
  });
  it.each([
    { email: 'invalid', password: 'secret' },
    { email: 'a@example.com', password: '' },
    { email: 'a@example.com', password: 'é'.repeat(37) },
    { email: 'a@example.com', password: 'secret', role: 'tutor' },
  ])('rejects malformed or excessive login input %#', (body) => {
    expect(() => validate(loginSchema, body)).toThrow();
  });
  it('accepts UTC or offset timestamps and returns a UTC instant', () => {
    expect(validate(createSlotSchema, { starts_at: future.toISOString() }).starts_at).toEqual(future);
    expect(validate(createSlotSchema, { starts_at: '2099-05-12T17:30:00+08:00' }).starts_at.toISOString())
      .toBe('2099-05-12T09:30:00.000Z');
  });
  it.each([
    '2099-05-12T09:15:00Z', '2099-05-12T09:00:01Z', '2099-05-12T09:00:00.001Z',
    '2099-05-12T09:00:00', '2099-02-30T09:00:00Z', '2020-05-12T09:00:00Z', 'not-a-date',
  ])('rejects an invalid appointment time %s', (starts_at) => {
    expect(() => validate(createSlotSchema, { starts_at })).toThrow();
  });
  it.each(['0', '-1', '1.5', '1 OR 1=1', '2147483648', '01'])('rejects invalid route ID %s', (id) => {
    expect(() => validate(idParameterSchema, { id })).toThrow();
  });
  it('validates booking IDs without coercing body types', () => {
    expect(validate(createBookingSchema, { slot_id: 1 })).toEqual({ slot_id: 1 });
    expect(() => validate(createBookingSchema, { slot_id: '1' })).toThrow();
  });
  it('bounds pagination and rejects unknown or repeated query parameters', () => {
    expect(validate(paginationSchema, {})).toEqual({ limit: 100, offset: 0 });
    expect(validate(paginationSchema, { limit: '10', offset: '20' })).toEqual({ limit: 10, offset: 20 });
    for (const query of [{ limit: '101' }, { offset: '-1' }, { limit: ['1', '2'] }, { status: 'open' }]) {
      expect(() => validate(paginationSchema, query)).toThrow();
    }
  });
});

describe('configuration safety', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/slotguard', JWT_SECRET: 'a'.repeat(48), CORS_ORIGIN: 'http://localhost:5173' };
  it('loads safe defaults and exact origins', () => {
    expect(loadConfig(env)).toMatchObject({ port: 3000, poolMax: 10, trustProxyHops: 0, corsOrigins: ['http://localhost:5173'] });
  });
  it('rejects placeholder secrets and wildcard or path-bearing origins', () => {
    expect(() => loadConfig({ ...env, JWT_SECRET: 'replace-with-at-least-32-random-characters' })).toThrow();
    for (const origin of ['*', 'http://localhost:5173/path', '']) {
      expect(() => loadConfig({ ...env, CORS_ORIGIN: origin })).toThrow();
    }
  });
  it('refuses production, remote, missing, or database-option test targets', () => {
    for (const url of [undefined, 'postgresql://localhost/slotguard', 'postgresql://example.com/slotguard_test',
      'postgresql://localhost/slotguard_test?options=-csearch_path%3Dpublic',
      'postgresql://localhost/slotguard_test?host=example.com']) {
      expect(() => validateTestDatabaseUrl(url)).toThrow();
    }
    expect(validateTestDatabaseUrl('postgresql://127.0.0.1:55432/slotguard_test')).toContain('slotguard_test');
  });
});
