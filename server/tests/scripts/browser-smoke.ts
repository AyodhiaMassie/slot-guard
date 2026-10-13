import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../../src/db/migrate.js';
import { seed } from '../../src/db/seed.js';
import { connectTestDatabase } from '../helpers/test-database.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const frontendUrl = 'http://localhost:5181';
const apiUrl = 'http://127.0.0.1:3301/api';
const output = path.join(root, '.local/browser-build');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const children: { process: ChildProcess; done: Promise<number | null> }[] = [];

async function requireFreePort(port: number, host: string): Promise<void> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, host, resolve);
  });
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
}

function start(args: string[], cwd: string, variables: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd, env: { ...process.env, ...variables }, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  const done = new Promise<number | null>((resolve) => {
    child.once('error', () => resolve(1));
    child.once('exit', resolve);
  });
  const running = { process: child, done };
  children.push(running);
  return running;
}

async function ready(url: string, service: ReturnType<typeof start>): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    assert(service.process.exitCode === null && service.process.signalCode === null, 'Verification service exited before becoming ready.');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local production verification service did not become ready.');
}

async function main(): Promise<void> {
  // Verify the actual database before any seeds or application processes can touch it.
  const pool = await connectTestDatabase();
  try {
    await requireFreePort(3301, '0.0.0.0');
    await requireFreePort(5181, 'localhost');
    await access(path.join(root, 'server/dist/index.js'));
    await migrate(pool);
    await seed(pool);
  } finally {
    await pool.end();
  }
  try {
    await mkdir(path.dirname(output), { recursive: true });
    const build = start([vite, 'build', '--outDir', output], path.join(root, 'client'), {
      VITE_API_BASE_URL: apiUrl, RENDER: 'false',
    });
    assert.equal(await build.done, 0, 'Isolated frontend production build failed.');
    const api = start(['dist/index.js'], path.join(root, 'server'), {
      NODE_ENV: 'production', PORT: '3301', CORS_ORIGIN: frontendUrl, TRUST_PROXY_HOPS: '0',
      DATABASE_URL: process.env.TEST_DATABASE_URL!, JWT_SECRET: randomBytes(48).toString('hex'), DB_POOL_MAX: '5',
    });
    const frontend = start([vite, 'preview', '--host', 'localhost', '--port', '5181', '--strictPort', '--outDir', output], path.join(root, 'client'));
    await Promise.all([ready(`${apiUrl}/health`, api), ready(frontendUrl, frontend)]);
    const smoke = start(['tests/browser/smoke.mjs'], path.join(root, 'client'), {
      SLOTGUARD_FRONTEND_URL: frontendUrl, SLOTGUARD_API_URL: apiUrl,
    });
    assert.equal(await smoke.done, 0, 'Production browser smoke failed.');
  } finally {
    for (const child of children.reverse()) {
      if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill();
      await child.done;
    }
  }
}

main().catch(() => {
  console.error('Isolated browser smoke failed. Build the API, use a local test database, and inspect the preceding test output.');
  process.exitCode = 1;
});
