// Migrations sans CLI Prisma.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from '../apps/api/src/db/driver.js';
import { databaseSettings } from '../apps/api/src/db/settings.js';

const statusOnly = process.argv.includes('--status');
const dir = fileURLToPath(new URL('../apps/api/prisma/migrations', import.meta.url));
const migrations = readdirSync(dir)
  .filter((name) => /^\d{14}_[\w-]+$/.test(name))
  .sort()
  .map((name) => {
    const sql = readFileSync(join(dir, name, 'migration.sql'));
    return { name, sql: sql.toString('utf8'), checksum: createHash('sha256').update(sql).digest('hex') };
  });

const conn = await mariadb.createConnection({ ...databaseSettings(), multipleStatements: true, initSql: "SET time_zone = '+00:00'" });
try {
  await conn.query(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id VARCHAR(36) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    finished_at DATETIME(3) NULL,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT NULL,
    rolled_back_at DATETIME(3) NULL,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const rows = await conn.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');
  const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at);
  if (failed.length) {
    console.error(`Migration en échec à corriger d'abord : ${failed.map((r) => r.migration_name).join(', ')} (voir la colonne logs de _prisma_migrations).`);
    process.exitCode = 1;
  } else {
    const applied = new Map(rows.filter((r) => r.finished_at).map((r) => [r.migration_name, r.checksum]));
    for (const m of migrations) {
      if (applied.has(m.name) && applied.get(m.name) !== m.checksum) {
        console.warn(`ATTENTION : ${m.name} a été modifiée après son application (empreinte différente). Une migration appliquée ne doit jamais être modifiée.`);
      }
    }
    const pending = migrations.filter((m) => !applied.has(m.name));
    console.log(`${migrations.length} migration(s) dans le dépôt, ${applied.size} appliquée(s), ${pending.length} en attente.`);
    if (!statusOnly) {
      for (const m of pending) {
        const id = randomUUID();
        await conn.query('INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, UTC_TIMESTAMP(3), 0)', [id, m.checksum, m.name]);
        try {
          await conn.query(m.sql);
        } catch (err) {
          await conn.query('UPDATE _prisma_migrations SET logs = ? WHERE id = ?', [String(err.message).slice(0, 60_000), id]);
          throw new Error(`Échec de la migration ${m.name} : ${err.message}`, { cause: err });
        }
        await conn.query('UPDATE _prisma_migrations SET finished_at = UTC_TIMESTAMP(3), applied_steps_count = 1 WHERE id = ?', [id]);
        console.log(`  appliquée : ${m.name}`);
      }
      console.log(pending.length ? 'Base à jour.' : 'Rien à faire : la base est déjà à jour.');
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
