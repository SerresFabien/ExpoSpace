import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { afterAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { databaseSettings } from '../src/db/settings.js';
import { absoluteUploadPath } from '../src/services/images.js';
import { newUser, publish, readyExhibition } from './helpers.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const source = databaseSettings();
const restoreDb = `expospace_restore_${randomBytes(4).toString('hex')}`;
const restoreUrl = `mysql://${encodeURIComponent(source.user)}:${encodeURIComponent(source.password)}@${source.host}:${source.port}/${restoreDb}`;
const restoreDir = mkdtempSync(join(tmpdir(), '.expospace-restore-'));

function node(script, args, env) {
  const result = spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, DB_NAME: '', UPLOAD_DIR: '', TMP_DIR: '', MAINTENANCE_FILE: '', ...env } });
  if (result.status !== 0) throw new Error(`${script} : ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function admin(sql) {
  const conn = await mariadb.createConnection({ ...source, database: undefined });
  try {
    return await conn.query(sql);
  } finally {
    await conn.end();
  }
}

afterAll(async () => {
  await admin(`DROP DATABASE IF EXISTS \`${restoreDb}\``);
  rmSync(restoreDir, { recursive: true, force: true });
});

describe('sauvegarde et restauration (T27)', () => {
  it('restaure comptes, exposition, placements et images dans une base vide', async () => {
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 2);
    const pub = await publish(c, exhibition);

    const out = node('scripts/backup.mjs', ['--no-wait'], { DATABASE_URL: process.env.DATABASE_URL, DATA_DIR: config.dataDir });
    const archive = /: (\S+\.tar\.gz)/.exec(out)?.[1];
    expect(archive).toBeTruthy();
    expect(readdirSync(config.backupDir).some((n) => n.endsWith('.tar.gz'))).toBe(true);

    await admin(`CREATE DATABASE \`${restoreDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    node('scripts/migrate.mjs', [], { DATABASE_URL: restoreUrl });
    node('scripts/restore.mjs', [archive], { DATABASE_URL: restoreUrl, DATA_DIR: restoreDir });

    const conn = await mariadb.createConnection({ ...source, database: restoreDb });
    try {
      const [ex] = await conn.query('SELECT title, status, coverArtworkId FROM Exhibition WHERE id = ?', [pub.id]);
      expect(ex).toMatchObject({ title: pub.title, status: 'PUBLISHED', coverArtworkId: pub.coverArtworkId });
      const placements = await conn.query('SELECT p.slotCode FROM Placement p JOIN Room r ON r.id = p.roomId WHERE r.exhibitionId = ? ORDER BY p.slotCode', [pub.id]);
      expect(placements.map((p) => p.slotCode)).toEqual(['N1', 'N2']);
      const [user] = await conn.query('SELECT usernameKey, passwordHash FROM User WHERE id = ?', [c.user.id]);
      expect(user.usernameKey).toBe(c.user.username);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      const arts = await conn.query('SELECT imagePath, thumbnailPath FROM Artwork WHERE exhibitionId = ?', [pub.id]);
      for (const art of arts) {
        for (const name of [art.imagePath, art.thumbnailPath]) {
          expect(readFileSync(join(restoreDir, 'uploads', name)).equals(readFileSync(absoluteUploadPath(name)))).toBe(true);
        }
      }
    } finally {
      await conn.end();
    }

    expect(() => node('scripts/restore.mjs', [archive], { DATABASE_URL: restoreUrl, DATA_DIR: restoreDir })).toThrow(/Refus/);
  });
});
