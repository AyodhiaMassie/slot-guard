import { migrate } from '../../src/db/migrate.js';
import { seed } from '../../src/db/seed.js';
import { connectTestDatabase } from '../helpers/test-database.js';

async function main(): Promise<void> {
  const pool = await connectTestDatabase();
  try {
    await migrate(pool);
    await seed(pool);
    console.info('Isolated test database migrated and seeded.');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error('Test database preparation failed. Check the isolated local TEST_DATABASE_URL.');
  process.exitCode = 1;
});
