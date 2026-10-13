import { z } from 'zod';
import { ApiError } from './errors.js';

const databaseId = z.number().int().positive().max(2147483647);
export const idParameterSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(databaseId),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes.'),
}).strict();

export const createSlotSchema = z.object({
  starts_at: z.string().datetime({ offset: true }).transform((value) => new Date(value))
    .refine((date) => date.getTime() % (30 * 60 * 1000) === 0,
      'Slots must start on a UTC half-hour boundary.')
    .refine((date) => date.getTime() > Date.now(), 'Slots must start in the future.'),
}).strict();

export const createBookingSchema = z.object({ slot_id: databaseId }).strict();
export const emptyObjectSchema = z.object({}).strict();
const unsignedInteger = z.string().regex(/^\d+$/).transform(Number);
export const paginationSchema = z.object({
  limit: unsignedInteger.pipe(z.number().int().min(1).max(100)).default(100),
  offset: unsignedInteger.pipe(z.number().int().min(0).max(1000000)).default(0),
}).strict();
export type Pagination = z.infer<typeof paginationSchema>;

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request input.', result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })));
  }
  return result.data;
}
