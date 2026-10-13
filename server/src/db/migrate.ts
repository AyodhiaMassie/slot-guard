import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { withTransaction } from './pool.js';

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

export async function migrate(pool: Pool): Promise<void> {
  const files = (await readdir(migrationsDirectory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  await withTransaction(pool, async (client) => {
    // Serialize migration runners and commit schema changes together with their checksums.
    await client.query('SELECT pg_advisory_xact_lock(75319041)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    )`);
    for (const name of files) {
      const sql = await readFile(new URL(name, migrationsDirectory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1', [name],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration changed: ${name}. Add a new migration instead.`);
        }
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
    }
  });
}
