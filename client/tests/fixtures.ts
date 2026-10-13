import type { Appointment, Slot, Tutor, TutorSlot, User } from '../src/types';

export const student: User = {
  id: 1,
  name: 'Alex Morgan',
  email: 'alex.student@slotguard.demo',
  role: 'student',
  specialty: null,
  description: null,
  created_at: '2026-01-01T00:00:00Z',
};
export const tutor: User = {
  ...student,
  id: 3,
  name: 'Dr Maya Chen',
  email: 'maya.tutor@slotguard.demo',
  role: 'tutor',
  specialty: 'Computer Science',
  description: 'Programming and algorithms.',
};
export const tutors: Tutor[] = [
  {
    id: 3,
    name: tutor.name,
    specialty: tutor.specialty,
    description: tutor.description,
    available_slot_count: 2,
  },
  {
    id: 4,
    name: 'Dr Noah Patel',
    specialty: 'Mathematics',
    description: 'Calculus and study planning.',
    available_slot_count: 0,
  },
];
export const slot: Slot = {
  id: 10,
  tutor_id: 3,
  starts_at: '2099-05-12T09:00:00.000Z',
  ends_at: '2099-05-12T09:30:00.000Z',
  status: 'open',
  created_at: student.created_at,
};
export const secondSlot: Slot = {
  ...slot,
  id: 11,
  starts_at: '2099-05-12T09:30:00.000Z',
  ends_at: '2099-05-12T10:00:00.000Z',
};
export const appointment: Appointment = {
  id: 20,
  slot_id: slot.id,
  student_id: student.id,
  status: 'confirmed',
  created_at: student.created_at,
  cancelled_at: null,
  starts_at: slot.starts_at,
  ends_at: slot.ends_at,
  slot_status: 'open',
  tutor_id: tutor.id,
  tutor_name: tutor.name,
  tutor_specialty: tutor.specialty,
  student_name: student.name,
  student_email: student.email,
};
export const ownSlot: TutorSlot = {
  ...slot,
  booking_id: null,
  booking_status: null,
  student_id: null,
  student_name: null,
  student_email: null,
};

export function saveSession(
  role: 'student' | 'tutor' = 'student',
  expiresAt = Date.now() + 3600000,
) {
  sessionStorage.setItem(
    'slotguard.session',
    JSON.stringify({ token: `${role}-token`, expiresAt }),
  );
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
