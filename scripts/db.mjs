// MariaDB local, sans droits administrateur.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const VERSION = '10.11.19';
const ARCHIVE = `mariadb-${VERSION}-linux-systemd-x86_64`;
const ARCHIVE_URL = `https://archive.mariadb.org/mariadb-${VERSION}/bintar-linux-systemd-x86_64`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = process.env.MARIADB_CACHE ?? join(homedir(), '.cache', 'expospace-mariadb');
const baseDir = join(cacheDir, VERSION);
const localDir = join(root, '.local');
const dataDir = join(localDir, 'mariadb');
const supervisorFile = join(localDir, 'db.pid');
const PORT = Number(process.env.DEV_DB_PORT ?? 33306);
const socketPath = join(tmpdir(), `expospace-mariadb-${PORT}.sock`);
const mariadbPidFile = join(localDir, 'mariadb.pid');
const APP_USER = 'expospace';
const APP_PASSWORD = process.env.DEV_DB_APP_PASSWORD ?? 'expospace-local-only';
const DATABASES = ['expospace', 'expospace_test', 'expospace_shadow'];

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readPid = (file) => {
  try {
    const pid = Number(readFileSync(file, 'utf8').trim());
    return pid && alive(pid) ? pid : null;
  } catch {
    return null;
  }
};
let stopping = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(300);
  }
  return false;
}

async function stop() {
  const supervisor = readPid(supervisorFile);
  if (supervisor) process.kill(supervisor, 'SIGTERM');
  const server = readPid(mariadbPidFile);
  if (server && !supervisor) process.kill(server, 'SIGTERM');
  await waitUntil(() => !readPid(mariadbPidFile), 30_000);
  rmSync(supervisorFile, { force: true });
  console.log(readPid(mariadbPidFile) ? 'MariaDB est toujours actif (ps aux | grep mariadbd).' : 'MariaDB local arrêté.');
  process.exit(0);
}

async function ensureBinaries() {
  if (existsSync(join(baseDir, 'bin', 'mariadbd'))) return;
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    console.error(`Binaires MariaDB automatiques disponibles seulement sous Linux x86_64. Installez MariaDB ${VERSION.split('.').slice(0, 2).join('.')} nativement.`);
    process.exit(1);
  }
  mkdirSync(join(cacheDir, 'download'), { recursive: true });
  const tarball = join(cacheDir, 'download', `${ARCHIVE}.tar.gz`);
  const sums = await (await fetch(`${ARCHIVE_URL}/sha256sums.txt`)).text();
  const expected = sums.split('\n').find((l) => l.endsWith(`${ARCHIVE}.tar.gz`))?.split(/\s+/)[0];
  if (!expected) throw new Error('Somme SHA-256 introuvable sur archive.mariadb.org.');
  if (!existsSync(tarball)) {
    console.log(`[mariadb] téléchargement de MariaDB ${VERSION} (~340 Mo, une seule fois)…`);
    const res = await fetch(`${ARCHIVE_URL}/${ARCHIVE}.tar.gz`);
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(`${tarball}.part`));
    renameSync(`${tarball}.part`, tarball);
  }
  const hash = createHash('sha256');
  await pipeline((await import('node:fs')).createReadStream(tarball), hash);
  if (hash.digest('hex') !== expected) {
    rmSync(tarball, { force: true });
    throw new Error('Somme SHA-256 incorrecte : archive supprimée, relancez la commande.');
  }
  console.log('[mariadb] extraction…');
  const tar = spawnSync('tar', ['-xzf', tarball, '-C', cacheDir], { stdio: 'inherit' });
  if (tar.status !== 0) throw new Error('Extraction impossible.');
  renameSync(join(cacheDir, ARCHIVE), baseDir);
  rmSync(join(baseDir, 'mysql-test'), { recursive: true, force: true });
  rmSync(join(baseDir, 'sql-bench'), { recursive: true, force: true });
}

function initialiseDataDir() {
  if (existsSync(join(dataDir, 'mysql'))) return;
  console.log('[mariadb] initialisation des données dans .local/mariadb…');
  mkdirSync(dataDir, { recursive: true });
  const init = spawnSync(
    join(baseDir, 'scripts', 'mariadb-install-db'),
    ['--no-defaults', `--basedir=${baseDir}`, `--datadir=${dataDir}`, '--auth-root-authentication-method=socket', '--skip-test-db'],
    { encoding: 'utf8' },
  );
  if (init.status !== 0) {
    rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`Initialisation impossible :\n${init.stdout}\n${init.stderr}`);
  }
}

async function adminConnection() {
  return mariadb.createConnection({ socketPath, user: process.env.USER ?? 'root' });
}

async function configureDatabases() {
  const conn = await adminConnection();
  try {
    for (const host of ['localhost', '127.0.0.1']) {
      await conn.query(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [APP_USER, host, APP_PASSWORD]);
      await conn.query(`GRANT ALL PRIVILEGES ON \`expospace%\`.* TO ?@?`, [APP_USER, host]);
    }
    for (const name of DATABASES) {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
  } finally {
    await conn.end();
  }
}

if (process.argv.includes('--stop')) await stop();

const running = readPid(mariadbPidFile);
if (running) {
  console.log(`MariaDB tourne déjà (PID ${running}, port ${PORT}). Pour l'arrêter : npm run db:stop`);
  process.exit(0);
}

let server;
try {
  await ensureBinaries();
  initialiseDataDir();
  mkdirSync(localDir, { recursive: true });
  server = spawn(
    join(baseDir, 'bin', 'mariadbd'),
    [
      '--no-defaults',
      `--basedir=${baseDir}`,
      `--datadir=${dataDir}`,
      `--port=${PORT}`,
      '--bind-address=127.0.0.1',
      `--socket=${socketPath}`,
      `--pid-file=${mariadbPidFile}`,
      `--log-error=${join(localDir, 'mariadb.err')}`,
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_unicode_ci',
      '--innodb-buffer-pool-size=128M',
      '--max-connections=100',
    ],
    { stdio: 'ignore' },
  );
  server.on('exit', (code) => {
    if (!stopping) {
      console.error(`MariaDB s'est arrêté (code ${code}). Voir .local/mariadb.err`);
      process.exit(1);
    }
  });
  const ready = await waitUntil(async () => {
    try {
      await (await adminConnection()).end();
      return true;
    } catch {
      return false;
    }
  }, 60_000);
  if (!ready) throw new Error('MariaDB ne répond pas après 60 s (voir .local/mariadb.err).');
  await configureDatabases();
} catch (err) {
  console.error(`MariaDB n'a pas pu démarrer : ${err?.message ?? err}`);
  server?.kill('SIGTERM');
  process.exit(1);
}

writeFileSync(supervisorFile, String(process.pid));
console.log(`[mariadb] MariaDB ${VERSION} prêt sur 127.0.0.1:${PORT} — bases ${DATABASES.join(', ')}, compte ${APP_USER}. Ctrl+C pour arrêter.`);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\nArrêt de MariaDB…');
  server.kill('SIGTERM');
  await waitUntil(() => server.exitCode !== null, 30_000);
  rmSync(supervisorFile, { force: true });
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
