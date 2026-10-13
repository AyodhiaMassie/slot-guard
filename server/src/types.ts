export type Role = 'student' | 'tutor';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: Role;
  specialty: string | null;
  description: string | null;
  created_at: Date;
}

export interface Slot {
  id: number;
  tutor_id: number;
  starts_at: Date;
  status: 'open' | 'closed';
  created_at: Date;
}

export interface Booking {
  id: number;
  slot_id: number;
  student_id: number;
  status: 'confirmed' | 'cancelled';
  created_at: Date;
  cancelled_at: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}
