// Tests d'intégration sur la base de test.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: join(root, '.env'), quiet: true });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('DATABASE_URL_TEST manquant dans .env (voir .env.example).');
  process.exit(1);
}
const dbName = new URL(testUrl).pathname.slice(1);
if (testUrl === process.env.DATABASE_URL || !/test/.test(dbName)) {
  console.error(`Refus : DATABASE_URL_TEST doit viser une base de test distincte (nom contenant « test »), reçu « ${dbName} ».`);
  process.exit(1);
}

const storage = mkdtempSync(join(tmpdir(), '.expospace-test-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testUrl,
  DB_HOST: '',
  DB_NAME: '',
  DB_USER: '',
  DB_PASSWORD: '',
  DATA_DIR: storage,
  UPLOAD_DIR: join(storage, 'uploads'),
  TMP_DIR: join(storage, 'tmp'),
  MAINTENANCE_FILE: join(storage, 'maintenance'),
  RATE_LIMITS: 'off',
  PUBLIC_ORIGIN: 'http://localhost:5173',
};

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, env, stdio: 'inherit' }).status ?? 1;

let status = run('node', ['scripts/migrate.mjs'], root);
if (status === 0) status = run('npx', ['vitest', 'run', '--project', 'api', ...process.argv.slice(2)], root);
rmSync(storage, { recursive: true, force: true });
process.exit(status);
