// Diagnostic de l'installation.
import { access, constants, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import mariadb from '../apps/api/src/db/driver.js';
import { config } from '../apps/api/src/config.js';
import { databaseSettings } from '../apps/api/src/db/settings.js';
import { loadModule } from '../apps/api/src/lib/loadModule.js';
import { HOSTING_LINK } from '../packages/shared/src/hosting.js';

let problems = 0;
const ok = (msg) => console.log(`OK        ${msg}`);
const ko = (msg) => {
  problems += 1;
  console.log(`PROBLÈME  ${msg}`);
};

console.log(`Node.js ${process.version}, NODE_ENV=${config.nodeEnv}`);
if (Number(process.versions.node.split('.')[0]) < 24) ko('Node.js 24 ou plus est nécessaire (choisir la version dans le panneau Node.js).');

try {
  const settings = databaseSettings();
  const conn = await mariadb.createConnection({ ...settings, connectTimeout: 10_000, initSql: "SET time_zone = '+00:00'" });
  const [info] = await conn.query('SELECT VERSION() AS version, DATABASE() AS base, @@session.time_zone AS fuseau');
  ok(`MariaDB ${info.version}, base « ${info.base} », fuseau de session ${info.fuseau}`);
  const tables = (await conn.query('SHOW TABLES')).map((row) => Object.values(row)[0]);
  const expected = ['User', 'Exhibition', 'Room', 'Artwork', 'Placement', 'Session'];
  const missing = expected.filter((t) => !tables.includes(t));
  if (missing.length) ko(`tables absentes : ${missing.join(', ')} → lancer le script db:deploy`);
  else ok('les six tables existent');
  const migrations = readdirSync(new URL('../apps/api/prisma/migrations', import.meta.url)).filter((n) => /^\d+_/.test(n));
  if (tables.includes('_prisma_migrations')) {
    const applied = (await conn.query('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')).map((r) => r.migration_name);
    const pending = migrations.filter((m) => !applied.includes(m));
    if (pending.length) ko(`migrations non appliquées : ${pending.join(', ')} → lancer le script db:deploy`);
    else ok(`${migrations.length} migration(s) appliquée(s)`);
  } else {
    ko('aucune migration appliquée → lancer le script db:deploy');
  }
  await conn.end();
} catch (err) {
  ko(`connexion à la base impossible : ${err.code ?? ''} ${err.message.split('\n')[0]} (vérifier DB_HOST, DB_NAME, DB_USER, DB_PASSWORD dans le fichier .env à la racine de l'application)`);
}

for (const [label, dir] of [
  ['images', config.uploadDir],
  ['temporaire', config.tmpDir],
]) {
  try {
    await mkdir(dir, { recursive: true });
    const probe = join(dir, `.ecriture-${process.pid}`);
    await writeFile(probe, 'ok');
    await rm(probe);
    ok(`dossier ${label} accessible en écriture : ${dir}`);
  } catch (err) {
    ko(`dossier ${label} inaccessible (${dir}) : ${err.code}`);
  }
}
if (config.uploadDir.startsWith(config.webDistDir ?? '\0')) ko('le dossier des images est dans la racine web : il doit être en dehors');

try {
  const html = await readFile(join(config.webDistDir ?? join(config.repoRoot, 'apps/web/dist'), 'index.html'), 'utf8');
  if (html.includes(HOSTING_LINK)) ok('index.html contient le lien By-Hoster exact');
  else ko('le lien By-Hoster exact est absent de index.html');
} catch {
  ko('interface construite introuvable (apps/web/dist/index.html)');
}

for (const name of ['sharp', 'argon2']) {
  try {
    await loadModule(name);
    ok(`module ${name} chargé`);
  } catch (err) {
    ko(`module ${name} non chargé : ${err.message.split('\n')[0]} → relancer « NPM install »`);
  }
}

try {
  await access(join(config.dataDir, 'session-secret'), constants.R_OK);
  ok('secret de session présent');
} catch {
  if (!process.env.SESSION_SECRET) console.log('INFO      le secret de session sera créé au premier démarrage');
}

console.log(problems ? `\n${problems} problème(s) à corriger.` : '\nTout est prêt.');
process.exit(problems ? 1 : 0);
