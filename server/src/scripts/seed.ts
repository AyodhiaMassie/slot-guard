import { seed } from '../db/seed.js';
import { runDatabaseCommand } from './run-database-command.js';

runDatabaseCommand('Demo seed', seed).catch(() => {
  console.error('Seed failed. Apply migrations and check database configuration.');
  process.exitCode = 1;
});
