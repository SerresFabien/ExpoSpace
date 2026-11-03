import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { afterAll, describe, expect, it } from 'vitest';
import { databaseSettings } from '../src/db/settings.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const s = databaseSettings();
const db = `expospace_migrate_${randomBytes(4).toString('hex')}`;
const url = `mysql://${encodeURIComponent(s.user)}:${encodeURIComponent(s.password)}@${s.host}:${s.port}/${db}`;

async function admin(sql) {
  const conn = await mariadb.createConnection({ ...s, database: undefined });
  try {
    return await conn.query(sql);
  } finally {
    await conn.end();
  }
}

const runner = (args = []) => spawnSync('node', ['scripts/migrate.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url, DB_NAME: '' } });

afterAll(() => admin(`DROP DATABASE IF EXISTS \`${db}\``));

describe('scripts/migrate.mjs', () => {
  it('applique les migrations sur une base neuve, une seule fois, de façon compatible avec Prisma', async () => {
    await admin(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const first = runner();
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/appliquée : \d+_init/);
    expect(first.stdout).toMatch(/appliquée : \d+_contraintes/);
    const second = runner();
    expect(second.stdout).toContain('Rien à faire');
    expect(runner(['--status']).stdout).toMatch(/0 en attente/);

    const env = { ...process.env, DATABASE_URL: url, DB_NAME: '' };
    const status = spawnSync('npx', ['prisma', 'migrate', 'status'], { cwd: join(root, 'apps/api'), encoding: 'utf8', env });
    expect(status.stdout).toContain('Database schema is up to date');
    const diff = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], { cwd: join(root, 'apps/api'), encoding: 'utf8', env });
    expect(diff.status).toBe(0);
  });
});
