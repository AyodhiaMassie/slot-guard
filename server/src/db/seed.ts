import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import { withTransaction } from './pool.js';

export const demoAccounts = [
  { name: 'Alex Morgan', email: 'alex.student@slotguard.demo', role: 'student', password: 'DemoStudent!2026', specialty: null, description: null },
  { name: 'Sam Rivera', email: 'sam.student@slotguard.demo', role: 'student', password: 'DemoStudent!2026', specialty: null, description: null },
  { name: 'Dr Maya Chen', email: 'maya.tutor@slotguard.demo', role: 'tutor', password: 'DemoTutor!2026', specialty: 'Computer Science', description: 'Fictional tutor for programming, algorithms, and software engineering.' },
  { name: 'Dr Noah Patel', email: 'noah.tutor@slotguard.demo', role: 'tutor', password: 'DemoTutor!2026', specialty: 'Mathematics', description: 'Fictional tutor for calculus, linear algebra, and study planning.' },
] as const;

export async function seed(pool: Pool): Promise<void> {
  const hashes = await Promise.all(demoAccounts.map((account) => bcrypt.hash(account.password, 12)));
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(75319042)');
    let tutorOffset = 0;
    for (const [index, account] of demoAccounts.entries()) {
      await client.query(`INSERT INTO users (name, email, password_hash, role, specialty, description)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
      [account.name, account.email, hashes[index], account.role, account.specialty, account.description]);
      const identity = await client.query<{ id: number; role: string }>('SELECT id, role FROM users WHERE email = $1', [account.email]);
      const user = identity.rows[0]!;
      if (user.role !== account.role) throw new Error('Existing demo account has an incompatible role');
      if (account.role === 'tutor') {
        // A rolling UTC window replenishes future availability without resetting slots or bookings.
        await client.query(`INSERT INTO appointment_slots (tutor_id, starts_at)
          SELECT $1, (date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC')
            + day_number * interval '1 day' + $2::integer * interval '1 hour'
            + slot_number * interval '30 minutes') AT TIME ZONE 'UTC'
          FROM generate_series(1, 7) AS day_number CROSS JOIN generate_series(0, 3) AS slot_number
          ON CONFLICT (tutor_id, starts_at) DO NOTHING`, [user.id, 9 + tutorOffset]);
        tutorOffset += 2;
      }
    }
  });
}
