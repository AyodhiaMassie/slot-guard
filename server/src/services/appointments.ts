import type { Pool, PoolClient } from 'pg';
import { assertOwnership } from '../auth.js';
import { withTransaction } from '../db/pool.js';
import { ApiError } from '../errors.js';
import type { Booking, Slot, UserProfile } from '../types.js';
import type { Pagination } from '../validation.js';
import { assertBookable, assertCancelable } from './booking-rules.js';

async function lockSlot(client: PoolClient, slotId: number): Promise<Slot> {
  const result = await client.query<Slot>('SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE', [slotId]);
  if (!result.rows[0]) throw new ApiError(404, 'SLOT_NOT_FOUND', 'The appointment slot does not exist.');
  return result.rows[0];
}

async function hasConfirmedBooking(client: PoolClient, slotId: number): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM bookings WHERE slot_id = $1 AND status = $2', [slotId, 'confirmed']);
  return result.rows.length > 0;
}

export class AppointmentService {
  constructor(private readonly pool: Pool) {}

  async listTutors({ limit, offset }: Pagination) {
    const result = await this.pool.query(`
      SELECT u.id, u.name, u.specialty, u.description,
        (SELECT count(*)::integer FROM appointment_slots s
          WHERE s.tutor_id = u.id AND s.status = 'open' AND s.starts_at > clock_timestamp()
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed'))
        AS available_slot_count
      FROM users u WHERE u.role = 'tutor' ORDER BY u.name, u.id LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows;
  }

  async listAvailableSlots(tutorId: number, { limit, offset }: Pagination) {
    const tutor = await this.pool.query('SELECT 1 FROM users WHERE id = $1 AND role = $2', [tutorId, 'tutor']);
    if (!tutor.rows[0]) throw new ApiError(404, 'TUTOR_NOT_FOUND', 'The tutor does not exist.');
    const result = await this.pool.query(`
      SELECT s.*, s.starts_at + interval '30 minutes' AS ends_at FROM appointment_slots s
      WHERE s.tutor_id = $1 AND s.status = 'open' AND s.starts_at > clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed')
      ORDER BY s.starts_at, s.id LIMIT $2 OFFSET $3`, [tutorId, limit, offset]);
    return result.rows;
  }

  async createSlot(tutorId: number, startsAt: Date): Promise<Slot> {
    const result = await this.pool.query<Slot>(`
      INSERT INTO appointment_slots (tutor_id, starts_at) VALUES ($1, $2) RETURNING *`, [tutorId, startsAt]);
    return result.rows[0]!;
  }

  async listOwnSlots(tutorId: number, { limit, offset }: Pagination) {
    const result = await this.pool.query(`
      SELECT s.*, s.starts_at + interval '30 minutes' AS ends_at,
        b.id AS booking_id, b.status AS booking_status, u.id AS student_id,
        u.name AS student_name, u.email AS student_email
      FROM appointment_slots s
      LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'confirmed'
      LEFT JOIN users u ON u.id = b.student_id
      WHERE s.tutor_id = $1 ORDER BY s.starts_at DESC, s.id DESC LIMIT $2 OFFSET $3`, [tutorId, limit, offset]);
    return result.rows;
  }

  async closeSlot(tutorId: number, slotId: number): Promise<Slot> {
    return withTransaction(this.pool, async (client) => {
      const slot = await lockSlot(client, slotId);
      assertOwnership(tutorId, slot.tutor_id);
      if (await hasConfirmedBooking(client, slotId)) {
        throw new ApiError(409, 'SLOT_BOOKED', 'A booked slot cannot be closed.');
      }
      const result = await client.query<Slot>(
        "UPDATE appointment_slots SET status = 'closed' WHERE id = $1 RETURNING *", [slotId],
      );
      return result.rows[0]!;
    });
  }

  async bookSlot(studentId: number, slotId: number): Promise<Booking> {
    return withTransaction(this.pool, async (client) => {
      const slot = await lockSlot(client, slotId);
      assertBookable(slot, await hasConfirmedBooking(client, slotId));
      const result = await client.query<Booking>(
        'INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2) RETURNING *', [slotId, studentId],
      );
      return result.rows[0]!;
    });
  }

  async listBookings(user: UserProfile, { limit, offset }: Pagination) {
    // The predicate is chosen from fixed server strings, never from request input.
    const ownerPredicate = user.role === 'student' ? 'b.student_id = $1' : 's.tutor_id = $1';
    const result = await this.pool.query(`
      SELECT b.*, s.starts_at, s.starts_at + interval '30 minutes' AS ends_at, s.status AS slot_status,
        t.id AS tutor_id, t.name AS tutor_name, t.specialty AS tutor_specialty,
        u.name AS student_name, u.email AS student_email
      FROM bookings b JOIN appointment_slots s ON s.id = b.slot_id
      JOIN users t ON t.id = s.tutor_id JOIN users u ON u.id = b.student_id
      WHERE ${ownerPredicate} ORDER BY s.starts_at DESC, b.id DESC LIMIT $2 OFFSET $3`, [user.id, limit, offset]);
    return result.rows;
  }

  async cancelBooking(studentId: number, bookingId: number): Promise<Booking> {
    return withTransaction(this.pool, async (client) => {
      const lookup = await client.query<{ slot_id: number; student_id: number }>(
        'SELECT slot_id, student_id FROM bookings WHERE id = $1', [bookingId],
      );
      const target = lookup.rows[0];
      if (!target) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'The booking does not exist.');
      assertOwnership(studentId, target.student_id);
      // Always lock slot before booking, matching book/close and avoiding lock-order deadlocks.
      const slot = await lockSlot(client, target.slot_id);
      const locked = await client.query<Booking>('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      const booking = locked.rows[0];
      if (!booking) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'The booking does not exist.');
      assertOwnership(studentId, booking.student_id);
      assertCancelable(booking, slot);
      const result = await client.query<Booking>(`
        UPDATE bookings SET status = 'cancelled', cancelled_at = clock_timestamp()
        WHERE id = $1 RETURNING *`, [bookingId]);
      return result.rows[0]!;
    });
  }
}
