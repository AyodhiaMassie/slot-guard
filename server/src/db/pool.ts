import { Pool, type PoolClient } from 'pg';
import { validateDatabaseUrl } from './connection-config.js';

export function createPool(databaseUrl: string, max = 10): Pool {
  validateDatabaseUrl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 10000,
    enableChannelBinding: true,
  });
  pool.on('error', (error) => {
    console.error('Idle database connection failed', { type: error.name });
  });
  return pool;
}

export async function withTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discardClient = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
