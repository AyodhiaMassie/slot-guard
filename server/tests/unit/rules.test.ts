import { describe, expect, it } from 'vitest';
import { assertOwnership, assertRole } from '../../src/auth.js';
import { assertBookable, assertCancelable } from '../../src/services/booking-rules.js';
import type { Booking, Slot, UserProfile } from '../../src/types.js';

const now = Date.now();
const slot: Slot = { id: 1, tutor_id: 3, starts_at: new Date(now + 60000), status: 'open', created_at: new Date(now) };
const booking: Booking = { id: 1, slot_id: 1, student_id: 1, status: 'confirmed', created_at: new Date(now), cancelled_at: null };
const student: UserProfile = { id: 1, name: 'Student', email: 'student@demo.test', role: 'student', specialty: null, description: null, created_at: new Date(now) };

describe('authorization', () => {
  it('allows only matching roles', () => {
    expect(() => assertRole(student, ['student'])).not.toThrow();
    expect(() => assertRole(student, ['tutor'])).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('allows only the record owner', () => {
    expect(() => assertOwnership(1, 1)).not.toThrow();
    expect(() => assertOwnership(1, 2)).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe('appointment decisions', () => {
  it('requires a future open slot without a confirmed reservation', () => {
    expect(() => assertBookable(slot, false, now)).not.toThrow();
    expect(() => assertBookable(slot, true, now)).toThrow();
    expect(() => assertBookable({ ...slot, status: 'closed' }, false, now)).toThrow();
    expect(() => assertBookable({ ...slot, starts_at: new Date(now) }, false, now)).toThrow();
  });
  it('allows only upcoming confirmed bookings to be cancelled', () => {
    expect(() => assertCancelable(booking, slot, now)).not.toThrow();
    expect(() => assertCancelable({ ...booking, status: 'cancelled' }, slot, now)).toThrow();
    expect(() => assertCancelable(booking, { ...slot, starts_at: new Date(now - 1) }, now)).toThrow();
  });
});
