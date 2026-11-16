// Serveur des tests Playwright.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: join(root, '.env'), quiet: true });
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl || testUrl === process.env.DATABASE_URL) {
  console.error('DATABASE_URL_TEST doit viser une base de test distincte.');
  process.exit(1);
}

const port = process.env.E2E_PORT ?? '3100';
const storage = mkdtempSync(join(tmpdir(), '.expospace-e2e-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl,
  PORT: port,
  HOST: '127.0.0.1',
  PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
  DATA_DIR: storage,
  UPLOAD_DIR: join(storage, 'uploads'),
  TMP_DIR: join(storage, 'tmp'),
  MAINTENANCE_FILE: join(storage, 'maintenance'),
  RATE_LIMITS: 'off',
  SERVE_WEB_DIST: join(root, 'apps', 'web', 'dist'),
};

const step = (cmd, args, cwd = root) => {
  const status = spawnSync(cmd, args, { cwd, env, stdio: 'inherit' }).status;
  if (status !== 0) process.exit(status ?? 1);
};
step('npm', ['run', 'build']);
step('node', ['scripts/migrate.mjs']);

const api = spawn('node', ['apps/api/src/server.js'], { cwd: root, env, stdio: 'inherit' });
const stop = () => {
  api.kill('SIGTERM');
  rmSync(storage, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
api.on('exit', (code) => {
  rmSync(storage, { recursive: true, force: true });
  process.exit(code ?? 0);
});
