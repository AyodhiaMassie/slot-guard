import 'dotenv/config';
import type { Pool } from 'pg';
import { createPool } from '../db/pool.js';

export async function runDatabaseCommand(label: string, operation: (pool: Pool) => Promise<void>): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error('DATABASE_URL is required');
  const pool = createPool(url);
  try {
    await operation(pool);
    console.info(`${label} completed.`);
  } finally {
    await pool.end();
  }
}
