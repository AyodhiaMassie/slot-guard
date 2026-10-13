import { migrate } from '../db/migrate.js';
import { runDatabaseCommand } from './run-database-command.js';

runDatabaseCommand('Migrations', migrate).catch(() => {
  console.error('Migration failed. Check connectivity and migration checksums.');
  process.exitCode = 1;
});
