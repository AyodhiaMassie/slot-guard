export type Role = 'student' | 'tutor';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  specialty: string | null;
  description: string | null;
  created_at: string;
}

export interface Tutor {
  id: number;
  name: string;
  specialty: string | null;
  description: string | null;
  available_slot_count: number;
}

export interface Slot {
  id: number;
  tutor_id: number;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'closed';
  created_at: string;
}

export interface TutorSlot extends Slot {
  booking_id: number | null;
  booking_status: 'confirmed' | null;
  student_id: number | null;
  student_name: string | null;
  student_email: string | null;
}

export interface Booking {
  id: number;
  slot_id: number;
  student_id: number;
  status: 'confirmed' | 'cancelled';
  created_at: string;
  cancelled_at: string | null;
}

export interface Appointment extends Booking {
  starts_at: string;
  ends_at: string;
  slot_status: 'open' | 'closed';
  tutor_id: number;
  tutor_name: string;
  tutor_specialty: string | null;
  student_name: string;
  student_email: string;
}

export interface LoginResponse {
  token: string;
  expires_in: number;
  user: User;
}

export interface Notice {
  kind: 'success' | 'error';
  message: string;
}
