CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) <= 254),
  password_hash TEXT NOT NULL CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
  specialty TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE appointment_slots (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tutor_id INTEGER NOT NULL REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tutor_start_unique UNIQUE (tutor_id, starts_at),
  CONSTRAINT slot_half_hour CHECK (
    extract(minute FROM starts_at AT TIME ZONE 'UTC') IN (0, 30)
    AND extract(second FROM starts_at AT TIME ZONE 'UTC') = 0
    AND isfinite(starts_at)
  )
);

CREATE TABLE bookings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES appointment_slots(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT cancellation_timestamp CHECK (
    (status = 'confirmed' AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_at >= created_at)
  )
);

CREATE UNIQUE INDEX one_confirmed_booking_per_slot
ON bookings (slot_id) WHERE status = 'confirmed';

CREATE INDEX open_slots_by_start ON appointment_slots (starts_at, tutor_id) WHERE status = 'open';
CREATE INDEX tutor_slots_by_start ON appointment_slots (tutor_id, starts_at);
CREATE INDEX student_booking_history ON bookings (student_id, created_at DESC);
CREATE INDEX slot_booking_history ON bookings (slot_id, created_at DESC);
CREATE INDEX tutor_directory ON users (name, id) WHERE role = 'tutor';

-- Roles are fixed for demo identities; changing one would invalidate existing ownership.
CREATE FUNCTION prevent_role_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'User roles are immutable' USING ERRCODE = '23514', CONSTRAINT = 'user_role_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_role_guard BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION prevent_role_change();

CREATE FUNCTION enforce_slot_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.tutor_id AND role = 'tutor') THEN
    RAISE EXCEPTION 'Slot owner must be a tutor' USING ERRCODE = '23514', CONSTRAINT = 'slot_tutor_role';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.starts_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'New slots must be in the future' USING ERRCODE = '23514', CONSTRAINT = 'slot_future';
    END IF;
  ELSE
    IF (NEW.tutor_id, NEW.starts_at, NEW.created_at) IS DISTINCT FROM (OLD.tutor_id, OLD.starts_at, OLD.created_at) THEN
      RAISE EXCEPTION 'Slot schedule and owner are immutable' USING ERRCODE = '23514', CONSTRAINT = 'slot_immutable';
    END IF;
  END IF;
  -- UPDATE already holds this slot's row lock, shared with booking/cancellation decisions.
  IF NEW.status = 'closed' AND EXISTS (
    SELECT 1 FROM bookings WHERE slot_id = NEW.id AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Booked slots cannot be closed' USING ERRCODE = '23514', CONSTRAINT = 'slot_has_confirmed_booking';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER slot_rules BEFORE INSERT OR UPDATE ON appointment_slots
FOR EACH ROW EXECUTE FUNCTION enforce_slot_rules();

CREATE FUNCTION enforce_booking_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_slot appointment_slots%ROWTYPE;
BEGIN
  -- Enforce availability even for writers that bypass the API; the unique index is the final exclusivity guard.
  SELECT * INTO target_slot FROM appointment_slots WHERE id = NEW.slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot does not exist' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.student_id AND role = 'student') THEN
    RAISE EXCEPTION 'Booking owner must be a student' USING ERRCODE = '23514', CONSTRAINT = 'booking_student_role';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.slot_id, NEW.student_id, NEW.created_at) IS DISTINCT FROM (OLD.slot_id, OLD.student_id, OLD.created_at)
      OR OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'Booking history is immutable' USING ERRCODE = '23514', CONSTRAINT = 'booking_history_immutable';
    END IF;
    IF NEW.status = 'cancelled' AND target_slot.starts_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Past bookings cannot be cancelled' USING ERRCODE = '23514', CONSTRAINT = 'booking_cancellation_future';
    END IF;
  END IF;
  IF NEW.status = 'confirmed' AND (target_slot.status <> 'open' OR target_slot.starts_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'Slot is unavailable' USING ERRCODE = '23514', CONSTRAINT = 'booking_slot_available';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_rules BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION enforce_booking_rules();
