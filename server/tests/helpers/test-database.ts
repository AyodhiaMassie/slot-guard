import { config } from 'dotenv';
import { createPool } from '../../src/db/pool.js';

config({ path: '.env.test', quiet: true });

export function validateTestDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error('TEST_DATABASE_URL is required; real PostgreSQL integration tests are never silently skipped.');
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^slotguard(?:_[a-z0-9]+)?_test$/.test(database)
    || url.search !== '') {
    throw new Error('Tests require a local, isolated slotguard*_test database without connection query parameters.');
  }
  return value;
}

export async function connectTestDatabase() {
  const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const pool = createPool(url, 10);
  try {
    const result = await pool.query<{ name: string }>('SELECT current_database() AS name');
    if (result.rows[0]?.name !== decodeURIComponent(new URL(url).pathname.slice(1))) {
      throw new Error('Connected database does not match the isolated test database.');
    }
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
