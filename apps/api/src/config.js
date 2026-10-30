// Configuration de l'application.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
loadEnv({ path: join(repoRoot, '.env'), quiet: true });

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

const fromRoot = (path) => resolve(repoRoot, path);

const dataDir = fromRoot(env.DATA_DIR || '.local');

// SESSION_SECRET ou secret généré dans DATA_DIR.
function sessionSecret() {
  if (env.SESSION_SECRET) {
    if (isProd && (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('CHANGE_ME'))) {
      throw new Error('SESSION_SECRET doit contenir au moins 32 caractères aléatoires en production.');
    }
    return env.SESSION_SECRET;
  }
  const file = join(dataDir, 'session-secret');
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, randomBytes(48).toString('base64url'), { mode: 0o600, flag: 'wx' });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  return readFileSync(file, 'utf8').trim();
}

// Production : proxys locaux uniquement.
function trustProxy() {
  const value = env.TRUST_PROXY ?? (isProd ? 'loopback, linklocal, uniquelocal' : '0');
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export const config = Object.freeze({
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  repoRoot,
  host: env.HOST ?? '127.0.0.1',
  port: Number(env.PORT ?? 3000),
  sessionSecret: sessionSecret(),
  publicOrigins: (env.PUBLIC_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  dataDir,
  uploadDir: env.UPLOAD_DIR ? fromRoot(env.UPLOAD_DIR) : join(dataDir, 'uploads'),
  tmpDir: env.TMP_DIR ? fromRoot(env.TMP_DIR) : join(dataDir, 'tmp'),
  backupDir: env.BACKUP_DIR ? fromRoot(env.BACKUP_DIR) : join(dataDir, 'backups'),
  maintenanceFile: env.MAINTENANCE_FILE ? fromRoot(env.MAINTENANCE_FILE) : join(dataDir, 'maintenance'),
  trustProxy: trustProxy(),
  rateLimits: env.RATE_LIMITS !== 'off',
  maxTotalStorageBytes: env.MAX_TOTAL_STORAGE_MB ? Number(env.MAX_TOTAL_STORAGE_MB) * 1024 * 1024 : null,
  webDistDir: env.SERVE_WEB_DIST ? fromRoot(env.SERVE_WEB_DIST) : isProd ? fromRoot('apps/web/dist') : null,
});
