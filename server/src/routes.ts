import { Router, type Request } from 'express';
import type { Pool } from 'pg';
import { authenticate, currentUser, login, requireRole } from './auth.js';
import { AppointmentService } from './services/appointments.js';
import {
  createBookingSchema, createSlotSchema, emptyObjectSchema, idParameterSchema,
  loginSchema, paginationSchema, validate,
} from './validation.js';

function resourceId(request: Request): number {
  return validate(idParameterSchema, request.params).id;
}

export function createRoutes(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  const appointments = new AppointmentService(pool);
  const auth = authenticate(pool, jwtSecret);

  router.get('/health', async (request, response) => {
    validate(emptyObjectSchema, request.query);
    await pool.query('SELECT 1');
    response.json({ data: { status: 'ok' } });
  });
  router.post('/auth/login', async (request, response) => {
    validate(emptyObjectSchema, request.query);
    const body = validate(loginSchema, request.body);
    response.json({ data: await login(pool, jwtSecret, body.email, body.password) });
  });
  router.use(auth);
  router.get('/auth/me', (request, response) => {
    validate(emptyObjectSchema, request.query);
    response.json({ data: currentUser(request) });
  });
  router.get('/tutors', async (request, response) => {
    const page = validate(paginationSchema, request.query);
    response.json({ data: await appointments.listTutors(page), meta: page });
  });
  router.get('/tutors/:id/slots', async (request, response) => {
    const page = validate(paginationSchema, request.query);
    response.json({ data: await appointments.listAvailableSlots(resourceId(request), page), meta: page });
  });
  router.post('/slots', requireRole('tutor'), async (request, response) => {
    validate(emptyObjectSchema, request.query);
    const body = validate(createSlotSchema, request.body);
    response.status(201).json({ data: await appointments.createSlot(currentUser(request).id, body.starts_at) });
  });
  router.get('/slots/mine', requireRole('tutor'), async (request, response) => {
    const page = validate(paginationSchema, request.query);
    response.json({ data: await appointments.listOwnSlots(currentUser(request).id, page), meta: page });
  });
  router.patch('/slots/:id/close', requireRole('tutor'), async (request, response) => {
    validate(emptyObjectSchema, request.query);
    validate(emptyObjectSchema, request.body ?? {});
    response.json({ data: await appointments.closeSlot(currentUser(request).id, resourceId(request)) });
  });
  router.post('/bookings', requireRole('student'), async (request, response) => {
    validate(emptyObjectSchema, request.query);
    const body = validate(createBookingSchema, request.body);
    response.status(201).json({ data: await appointments.bookSlot(currentUser(request).id, body.slot_id) });
  });
  router.get('/bookings/mine', requireRole('student', 'tutor'), async (request, response) => {
    const page = validate(paginationSchema, request.query);
    response.json({ data: await appointments.listBookings(currentUser(request), page), meta: page });
  });
  router.patch('/bookings/:id/cancel', requireRole('student'), async (request, response) => {
    validate(emptyObjectSchema, request.query);
    validate(emptyObjectSchema, request.body ?? {});
    response.json({ data: await appointments.cancelBooking(currentUser(request).id, resourceId(request)) });
  });
  return router;
}
