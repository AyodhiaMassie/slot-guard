import { ApiError } from '../errors.js';
import type { Booking, Slot } from '../types.js';

export function assertBookable(slot: Slot, hasConfirmedBooking: boolean, now = Date.now()): void {
  if (slot.status !== 'open' || slot.starts_at.getTime() <= now || hasConfirmedBooking) {
    throw new ApiError(409, 'SLOT_UNAVAILABLE', 'This slot is no longer available.');
  }
}

export function assertCancelable(booking: Booking, slot: Slot, now = Date.now()): void {
  if (booking.status !== 'confirmed' || slot.starts_at.getTime() <= now) {
    throw new ApiError(409, 'BOOKING_NOT_CANCELABLE', 'Only upcoming confirmed bookings can be cancelled.');
  }
}
