import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config.js';
import { migrate } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';
import { seed } from '../../src/db/seed.js';
import { connectTestDatabase } from '../helpers/test-database.js';

let pool: Pool;
let app: Express;
let passwordHash: string;
let student1: number;
let student2: number;
let tutor1: number;
let tutor2: number;
let studentToken: string;
let otherStudentToken: string;
let tutorToken: string;
let otherTutorToken: string;
let sequence = 0;
const password = 'TestPassword!2026';
const config: AppConfig = {
  nodeEnv: 'test', port: 3000, databaseUrl: '', jwtSecret: randomBytes(48).toString('hex'),
  corsOrigins: ['http://localhost:5173'], trustProxyHops: 0, poolMax: 10,
};

function token(id: number, expiresIn = 3600): string {
  return jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', subject: String(id), issuer: 'slotguard', audience: 'slotguard-api', expiresIn });
}
function futureTime(): string {
  sequence += 1;
  return new Date(Math.ceil(Date.now() / 1800000) * 1800000 + (48 + sequence) * 1800000).toISOString();
}
async function createSlot(owner = tutor1): Promise<number> {
  const result = await pool.query<{ id: number }>('INSERT INTO appointment_slots (tutor_id, starts_at) VALUES ($1, $2) RETURNING id', [owner, futureTime()]);
  return result.rows[0]!.id;
}
function book(slotId: number, auth = studentToken) {
  return request(app).post('/api/bookings').auth(auth, { type: 'bearer' }).send({ slot_id: slotId });
}
function cancel(bookingId: number, auth = studentToken) {
  return request(app).patch(`/api/bookings/${bookingId}/cancel`).auth(auth, { type: 'bearer' }).send({});
}
function close(slotId: number, auth = tutorToken) {
  return request(app).patch(`/api/slots/${slotId}/close`).auth(auth, { type: 'bearer' }).send({});
}
async function confirmedCount(slotId: number): Promise<number> {
  const result = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM bookings WHERE slot_id = $1 AND status = 'confirmed'", [slotId]);
  return result.rows[0]!.count;
}

beforeAll(async () => {
  pool = await connectTestDatabase();
  await migrate(pool);
  passwordHash = await bcrypt.hash(password, 12);
});
beforeEach(async () => {
  await pool.query('TRUNCATE bookings, appointment_slots, users RESTART IDENTITY');
  const result = await pool.query<{ id: number }>(`INSERT INTO users (name, email, password_hash, role)
    VALUES ('Student One', 'one.student@demo.test', $1, 'student'),
      ('Student Two', 'two.student@demo.test', $1, 'student'),
      ('Tutor One', 'one.tutor@demo.test', $1, 'tutor'),
      ('Tutor Two', 'two.tutor@demo.test', $1, 'tutor') RETURNING id`, [passwordHash]);
  [student1, student2, tutor1, tutor2] = result.rows.map((row) => row.id) as [number, number, number, number];
  studentToken = token(student1);
  otherStudentToken = token(student2);
  tutorToken = token(tutor1);
  otherTutorToken = token(tutor2);
  app = createApp(pool, config);
});
afterAll(async () => { await pool?.end(); });

describe('authentication and safe HTTP handling', () => {
  it('logs in, verifies a signed token, and never returns password hashes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: ' ONE.STUDENT@DEMO.TEST ', password }).expect(200);
    expect(login.body.data.expires_in).toBe(3600);
    expect(login.body.data.user.role).toBe('student');
    expect(JSON.stringify(login.body)).not.toContain('password_hash');
    const me = await request(app).get('/api/auth/me').auth(login.body.data.token, { type: 'bearer' }).expect(200);
    expect(me.body.data.id).toBe(student1);
  });
  it('rejects wrong passwords and unknown users with the same response', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: 'one.student@demo.test', password: 'wrong' }).expect(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'unknown@demo.test', password }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });
  it('rejects missing, malformed, expired, wrong-secret, and deleted-user tokens', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const wrongSecret = jwt.sign({}, 'different-secret', { subject: String(student1) });
    for (const invalid of ['invalid', token(student1, -1), wrongSecret, token(2147483647)]) {
      await request(app).get('/api/auth/me').auth(invalid, { type: 'bearer' }).expect(401);
    }
    const wrongAudience = jwt.sign({}, config.jwtSecret, { subject: String(student1), expiresIn: '1h', issuer: 'slotguard', audience: 'other' });
    await request(app).get('/api/auth/me').auth(wrongAudience, { type: 'bearer' }).expect(401);
  });
  it('returns consistent JSON for malformed input, missing routes, and health', async () => {
    await request(app).get('/api/health').expect(200, { data: { status: 'ok' } });
    await request(app).get('/missing').expect(404);
    const malformed = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    await request(app).post('/api/auth/login').send({ email: "x' OR 1=1 --", password }).expect(400);
    await request(app).get('/api/tutors?limit=101').auth(studentToken, { type: 'bearer' }).expect(400);
    await request(app).get('/api/tutors/1%20OR%201=1/slots').auth(studentToken, { type: 'bearer' }).expect(400);
    await request(app).get('/api/tutors/%E0%A4%A/slots').auth(studentToken, { type: 'bearer' }).expect(400);
    await request(app).post('/api/auth/login').send({ email: 'x'.repeat(17000), password }).expect(413);
    await request(app).post('/api/bookings').auth(studentToken, { type: 'bearer' }).send({ slot_id: '1' }).expect(400);
  });
  it('restricts browser origins and permits the configured origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', config.corsOrigins[0]!).expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(config.corsOrigins[0]);
    await request(app).get('/api/health').set('Origin', 'https://untrusted.example').expect(403);
  });
  it('limits failed login attempts', async () => {
    for (let index = 0; index < 20; index += 1) {
      await request(app).post('/api/auth/login').send({ email: 'bad' }).expect(400);
    }
    const limited = await request(app).post('/api/auth/login').send({ email: 'bad' }).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
  it('hides internal errors when a database connection is unavailable', async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = '/slotguard_missing_test';
    const unavailablePool = createPool(url.toString());
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const unavailableApp = createApp(unavailablePool, config);
      await request(unavailableApp).get('/api/health').expect(500, {
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
      });
      expect(logging).toHaveBeenCalled();
    } finally {
      await unavailablePool.end();
    }
  });
});

describe('roles, ownership, and availability', () => {
  it('enforces Student and Tutor roles for every restricted operation', async () => {
    await request(app).post('/api/slots').auth(studentToken, { type: 'bearer' }).send({ starts_at: futureTime() }).expect(403);
    await request(app).get('/api/slots/mine').auth(studentToken, { type: 'bearer' }).expect(403);
    await close(1, studentToken).expect(403);
    await book(1, tutorToken).expect(403);
    await cancel(1, tutorToken).expect(403);
  });
  it('creates half-hour UTC slots and rejects duplicates and invalid times', async () => {
    const starts_at = futureTime();
    const created = await request(app).post('/api/slots').auth(tutorToken, { type: 'bearer' }).send({ starts_at }).expect(201);
    expect(created.body.data.tutor_id).toBe(tutor1);
    expect(created.body.data.starts_at).toBe(starts_at);
    await request(app).post('/api/slots').auth(tutorToken, { type: 'bearer' }).send({ starts_at }).expect(409);
    for (const time of ['2020-01-01T09:00:00Z', '2099-01-01T09:15:00Z', '2099-01-01T09:30:01Z', '2099-01-01T09:30:00']) {
      await request(app).post('/api/slots').auth(tutorToken, { type: 'bearer' }).send({ starts_at: time }).expect(400);
    }
    await request(app).post('/api/slots').auth(tutorToken, { type: 'bearer' }).send({ starts_at: futureTime(), tutor_id: tutor2 }).expect(400);
  });
  it('lists tutor counts and only open future unreserved slots', async () => {
    const available = await createSlot();
    const reserved = await createSlot();
    const closed = await createSlot();
    await book(reserved).expect(201);
    await close(closed).expect(200);
    await createSlot(tutor2);
    const directory = await request(app).get('/api/tutors').auth(studentToken, { type: 'bearer' }).expect(200);
    expect(directory.body.data.find((row: { id: number }) => row.id === tutor1).available_slot_count).toBe(1);
    const slots = await request(app).get(`/api/tutors/${tutor1}/slots`).auth(studentToken, { type: 'bearer' }).expect(200);
    expect(slots.body.data.map((row: { id: number }) => row.id)).toEqual([available]);
    expect(new Date(slots.body.data[0].ends_at).getTime() - new Date(slots.body.data[0].starts_at).getTime()).toBe(1800000);
    await request(app).get(`/api/tutors/${student1}/slots`).auth(studentToken, { type: 'bearer' }).expect(404);
    const mine = await request(app).get('/api/slots/mine').auth(tutorToken, { type: 'bearer' }).expect(200);
    expect(mine.body.data).toHaveLength(3);
    expect(mine.body.data.find((row: { id: number }) => row.id === reserved).student_name).toBe('Student One');
  });
  it('checks ownership and scopes appointment history for both roles', async () => {
    const slotId = await createSlot();
    const created = await book(slotId).expect(201);
    await close(slotId, otherTutorToken).expect(403);
    await cancel(created.body.data.id, otherStudentToken).expect(403);
    for (const [auth, count] of [[studentToken, 1], [otherStudentToken, 0], [tutorToken, 1], [otherTutorToken, 0]] as const) {
      const mine = await request(app).get('/api/bookings/mine').auth(auth, { type: 'bearer' }).expect(200);
      expect(mine.body.data).toHaveLength(count);
      expect(JSON.stringify(mine.body)).not.toContain('password_hash');
    }
  });
});

describe('booking, cancellation, closure, and persistence', () => {
  it('books once, rejects unavailable slots, and reports missing resources', async () => {
    const slotId = await createSlot();
    const result = await book(slotId).expect(201);
    expect(result.body.data.status).toBe('confirmed');
    await book(slotId, otherStudentToken).expect(409);
    await book(2147483647).expect(404);
    await cancel(2147483647).expect(404);
    await close(2147483647).expect(404);
    expect(await confirmedCount(slotId)).toBe(1);
    const secondPool = createPool(process.env.TEST_DATABASE_URL!);
    try {
      const persisted = await request(createApp(secondPool, config)).get('/api/bookings/mine').auth(studentToken, { type: 'bearer' }).expect(200);
      expect(persisted.body.data[0].id).toBe(result.body.data.id);
    } finally { await secondPool.end(); }
  });
  it('cancels, preserves history, and allows a different student to book', async () => {
    const slotId = await createSlot();
    const first = await book(slotId).expect(201);
    const cancelled = await cancel(first.body.data.id).expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(cancelled.body.data.cancelled_at).toBeTruthy();
    await cancel(first.body.data.id).expect(409);
    const available = await request(app).get(`/api/tutors/${tutor1}/slots`).auth(studentToken, { type: 'bearer' }).expect(200);
    expect(available.body.data.map((row: { id: number }) => row.id)).toContain(slotId);
    await book(slotId, otherStudentToken).expect(201);
    const history = await pool.query('SELECT status FROM bookings WHERE slot_id = $1 ORDER BY id', [slotId]);
    expect(history.rows.map((row) => row.status)).toEqual(['cancelled', 'confirmed']);
    expect(await confirmedCount(slotId)).toBe(1);
  });
  it('closes unbooked slots and refuses booked or subsequently closed reservations', async () => {
    const slotId = await createSlot();
    const booked = await book(slotId).expect(201);
    await close(slotId).expect(409);
    await cancel(booked.body.data.id).expect(200);
    await close(slotId).expect(200);
    await close(slotId).expect(200);
    await book(slotId, otherStudentToken).expect(409);
  });
  it('rejects booking and cancellation once a slot has started', async () => {
    // Simulate a historical fixture with a transaction-scoped trigger bypass confined to this test database.
    const client = await pool.connect();
    let pastSlot: number;
    let pastBooking: number;
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE appointment_slots DISABLE TRIGGER slot_rules');
      const slot = await client.query<{ id: number }>(`INSERT INTO appointment_slots (tutor_id, starts_at)
        VALUES ($1, date_trunc('hour', clock_timestamp()) - interval '1 day') RETURNING id`, [tutor1]);
      pastSlot = slot.rows[0]!.id;
      await client.query('ALTER TABLE appointment_slots ENABLE TRIGGER slot_rules');
      await client.query('ALTER TABLE bookings DISABLE TRIGGER booking_rules');
      const booking = await client.query<{ id: number }>('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2) RETURNING id', [pastSlot, student1]);
      pastBooking = booking.rows[0]!.id;
      await client.query('ALTER TABLE bookings ENABLE TRIGGER booking_rules');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    await book(pastSlot!).expect(409);
    await cancel(pastBooking!).expect(409);
    const available = await request(app).get(`/api/tutors/${tutor1}/slots`).auth(studentToken, { type: 'bearer' }).expect(200);
    expect(available.body.data).toEqual([]);
  });
});

describe('real PostgreSQL concurrency', () => {
  it('returns exactly one 201 and one 409 for two simultaneous distinct students', async () => {
    const slotId = await createSlot();
    // Hold the row until both HTTP transactions are waiting, proving actual lock contention.
    const blocker = await pool.connect();
    const observer = await pool.connect();
    let pending: Promise<request.Response[]> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM appointment_slots WHERE id = $1 FOR UPDATE', [slotId]);
      pending = Promise.all([book(slotId), book(slotId, otherStudentToken)]);
      const deadline = Date.now() + 5000;
      let waiters = 0;
      while (Date.now() < deadline && waiters < 2) {
        const result = await observer.query<{ count: number }>(`SELECT count(*)::integer AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE 'SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE%'`);
        waiters = result.rows[0]!.count;
        if (waiters < 2) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiters).toBe(2);
      await blocker.query('COMMIT');
      const responses = await pending;
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await confirmedCount(slotId)).toBe(1);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      observer.release();
      if (pending) await pending;
    }
  });
  it('coordinates a booking against closure without a confirmed booking on a closed slot', async () => {
    for (let index = 0; index < 8; index += 1) {
      const slotId = await createSlot();
      const [booked, closed] = await Promise.all([book(slotId), close(slotId)]);
      expect([[201, 409], [409, 200]]).toContainEqual([booked.status, closed.status]);
      const state = await pool.query<{ status: string }>('SELECT status FROM appointment_slots WHERE id = $1', [slotId]);
      expect(await confirmedCount(slotId)).toBe(state.rows[0]!.status === 'closed' ? 0 : 1);
    }
  });
  it('coordinates cancellation, rebooking, and closure with consistent state', async () => {
    for (let index = 0; index < 8; index += 1) {
      const slotId = await createSlot();
      const original = await book(slotId).expect(201);
      const [cancelled, rebooked, closed] = await Promise.all([
        cancel(original.body.data.id), book(slotId, otherStudentToken), close(slotId),
      ]);
      expect(cancelled.status).toBe(200);
      expect([201, 409]).toContain(rebooked.status);
      expect([200, 409]).toContain(closed.status);
      const state = await pool.query<{ status: string }>('SELECT status FROM appointment_slots WHERE id = $1', [slotId]);
      const confirmed = await confirmedCount(slotId);
      expect(confirmed).toBe(rebooked.status === 201 ? 1 : 0);
      if (state.rows[0]!.status === 'closed') expect(confirmed).toBe(0);
      expect((await pool.query('SELECT status FROM bookings WHERE id = $1', [original.body.data.id])).rows[0].status).toBe('cancelled');
    }
  });
  it('allows only one cancellation when two identical cancellation requests race', async () => {
    const original = await book(await createSlot()).expect(201);
    const responses = await Promise.all([cancel(original.body.data.id), cancel(original.body.data.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

describe('database safeguards and repeatable maintenance', () => {
  it('enforces the partial unique index independently of application checks', async () => {
    const slotId = await createSlot();
    await pool.query('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2)', [slotId, student1]);
    await expect(pool.query('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2)', [slotId, student2]))
      .rejects.toMatchObject({ code: '23505', constraint: 'one_confirmed_booking_per_slot' });
    expect(await confirmedCount(slotId)).toBe(1);
  });
  it('enforces role references, half-hour boundaries, unique emails, foreign keys, and cancellation timestamps', async () => {
    const slotId = await createSlot();
    await expect(pool.query('INSERT INTO appointment_slots (tutor_id, starts_at) VALUES ($1, $2)', [student1, futureTime()]))
      .rejects.toMatchObject({ code: '23514', constraint: 'slot_tutor_role' });
    await expect(pool.query('INSERT INTO appointment_slots (tutor_id, starts_at) VALUES ($1, $2)', [tutor1, '2099-01-01T09:15:00Z']))
      .rejects.toMatchObject({ code: '23514', constraint: 'slot_half_hour' });
    await expect(pool.query('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2)', [slotId, tutor1]))
      .rejects.toMatchObject({ code: '23514', constraint: 'booking_student_role' });
    await expect(pool.query('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2)', [2147483647, student1]))
      .rejects.toMatchObject({ code: '23503' });
    await expect(pool.query("INSERT INTO bookings (slot_id, student_id, status) VALUES ($1, $2, 'cancelled')", [slotId, student1]))
      .rejects.toMatchObject({ code: '23514', constraint: 'cancellation_timestamp' });
    await expect(pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Duplicate', 'one.student@demo.test', $1, 'student')", [passwordHash]))
      .rejects.toMatchObject({ code: '23505' });
    await expect(pool.query("UPDATE users SET role = 'tutor' WHERE id = $1", [student1]))
      .rejects.toMatchObject({ code: '23514', constraint: 'user_role_immutable' });
  });
  it('prevents direct SQL from closing booked slots, booking closed slots, or changing appointment ownership', async () => {
    const slotId = await createSlot();
    const original = await book(slotId).expect(201);
    await expect(pool.query("UPDATE appointment_slots SET status = 'closed' WHERE id = $1", [slotId]))
      .rejects.toMatchObject({ code: '23514', constraint: 'slot_has_confirmed_booking' });
    await expect(pool.query('UPDATE appointment_slots SET tutor_id = $1 WHERE id = $2', [tutor2, slotId]))
      .rejects.toMatchObject({ code: '23514', constraint: 'slot_immutable' });
    await cancel(original.body.data.id).expect(200);
    await close(slotId).expect(200);
    await expect(pool.query('INSERT INTO bookings (slot_id, student_id) VALUES ($1, $2)', [slotId, student2]))
      .rejects.toMatchObject({ code: '23514', constraint: 'booking_slot_available' });
    await expect(pool.query("UPDATE bookings SET status = 'confirmed', cancelled_at = NULL WHERE id = $1", [original.body.data.id]))
      .rejects.toMatchObject({ code: '23514', constraint: 'booking_history_immutable' });
  });
  it('runs migrations and seeds repeatedly without changing bookings, passwords, or closed slots', async () => {
    await migrate(pool);
    await seed(pool);
    const demoStudent = (await pool.query("SELECT id FROM users WHERE email = 'alex.student@slotguard.demo'")).rows[0].id as number;
    const demoSlot = (await pool.query('SELECT id FROM appointment_slots ORDER BY id LIMIT 1')).rows[0].id as number;
    await book(demoSlot, token(demoStudent)).expect(201);
    const closedSlot = (await pool.query('SELECT id FROM appointment_slots WHERE id <> $1 ORDER BY id LIMIT 1', [demoSlot])).rows[0].id as number;
    await pool.query("UPDATE appointment_slots SET status = 'closed' WHERE id = $1", [closedSlot]);
    const before = (await pool.query('SELECT id, password_hash FROM users ORDER BY id')).rows;
    const slotCount = (await pool.query('SELECT count(*) FROM appointment_slots')).rows[0].count;
    await seed(pool);
    expect((await pool.query('SELECT id, password_hash FROM users ORDER BY id')).rows).toEqual(before);
    expect((await pool.query('SELECT count(*) FROM appointment_slots')).rows[0].count).toBe(slotCount);
    expect(await confirmedCount(demoSlot)).toBe(1);
    expect((await pool.query('SELECT status FROM appointment_slots WHERE id = $1', [closedSlot])).rows[0].status).toBe('closed');
    await request(app).post('/api/auth/login').send({ email: 'alex.student@slotguard.demo', password: 'DemoStudent!2026' }).expect(200);
  });
});
