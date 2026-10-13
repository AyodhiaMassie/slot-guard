import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl, config.poolMax);
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    await pool.end();
    throw error;
  }
  const server = createApp(pool, config).listen(config.port, '0.0.0.0', () => {
    console.info(`SlotGuard API listening on port ${config.port}`);
  });
  server.on('error', () => {
    console.error('HTTP server failed to start');
    void pool.end().finally(() => { process.exitCode = 1; });
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void pool.end().finally(() => { clearTimeout(timeout); });
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('Startup failed', { type: error instanceof Error ? error.name : 'UnknownError' });
  process.exitCode = 1;
});
