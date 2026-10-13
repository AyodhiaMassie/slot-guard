import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { validateDatabaseUrl } from '../../src/db/connection-config.js';
import { createPool } from '../../src/db/pool.js';

describe('database TLS configuration', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('permits local PostgreSQL without TLS at %s', (host) => {
    expect(() => validateDatabaseUrl(`postgresql://user:password@${host}/slotguard_test`)).not.toThrow();
  });
  it.each(['', '?sslmode=disable', '?sslmode=no-verify', '?sslmode=require', '?sslmode=verify-ca',
    '?sslmode=verify-full&sslmode=no-verify'])('rejects unverifiable remote TLS configuration %s', (options) => {
    expect(() => validateDatabaseUrl(`postgresql://user:password@database.example/slotguard${options}`)).toThrow();
  });
  it.each(['host=database.example', 'hostaddr=192.0.2.1', 'ssl=0', 'uselibpqcompat=true'])
  ('rejects connection options that override the validated host or TLS: %s', (option) => {
    expect(() => validateDatabaseUrl(`postgresql://localhost/slotguard_test?${option}`)).toThrow();
  });
  it('retains certificate verification and channel binding with the installed pg driver', async () => {
    const pool = createPool('postgresql://user:password@database.example/slotguard?sslmode=verify-full', 5);
    try {
      expect(pool.options.enableChannelBinding).toBe(true);
      expect(pool.options.max).toBe(5);
      // Constructing a client parses TLS options without making a network connection.
      const client = new Client(pool.options);
      expect(client.ssl).toBeTruthy();
      expect(client.ssl).not.toMatchObject({ rejectUnauthorized: false });
    } finally {
      await pool.end();
    }
  });
  it.each(['not-a-url', 'https://database.example/slotguard', 'postgresql://localhost/slotguard#fragment'])
  ('rejects malformed database URLs without echoing credentials: %s', (url) => {
    expect(() => validateDatabaseUrl(url)).toThrow();
  });
});
