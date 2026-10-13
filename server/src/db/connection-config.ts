export function validateDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error('DATABASE_URL must specify a PostgreSQL host without a fragment.');
  }
  // URI query options can override the hostname or TLS configuration parsed by pg.
  for (const name of ['host', 'hostaddr', 'ssl', 'uselibpqcompat']) {
    if (url.searchParams.has(name)) throw new Error(`DATABASE_URL must not override ${name} through query options.`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const modes = url.searchParams.getAll('sslmode');
  if (modes.length > 1 || (!local && modes[0] !== 'verify-full')) {
    throw new Error('Remote DATABASE_URL connections require exactly one sslmode=verify-full.');
  }
}
