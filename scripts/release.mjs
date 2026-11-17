// Archive de livraison.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTING_LINK } from '../packages/shared/src/hosting.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const run = (cmd, args, cwd = root) => {
  const status = spawnSync(cmd, args, { cwd, stdio: 'inherit' }).status;
  if (status !== 0) throw new Error(`Échec : ${cmd} ${args.join(' ')}`);
};
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

console.log('1/4 Construction de l’interface et du client Prisma');
run('npm', ['run', 'build']);
run('npx', ['prisma', 'generate'], join(root, 'apps', 'api'));
const html = readFileSync(join(root, 'apps/web/dist/index.html'), 'utf8');
if (!html.includes(HOSTING_LINK)) throw new Error('Le lien By-Hoster exact est absent de apps/web/dist/index.html : livraison refusée.');

console.log('2/4 Copie des fichiers');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const staging = join(root, '.local', 'release', 'expospace');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
const copy = (path) => cpSync(join(root, path), join(staging, path), { recursive: true });
for (const path of [
  'app.cjs',
  'package-lock.json',
  '.nvmrc',
  'apps/api/prisma',
  'apps/api/src',
  'apps/api/generated',
  'apps/web/dist',
  'packages/shared/package.json',
  'packages/shared/src',
  'scripts/admin.mjs',
  'scripts/backup.mjs',
  'scripts/cleanup-uploads.mjs',
  'scripts/lib/tar.mjs',
  'scripts/db-check.mjs',
  'scripts/migrate.mjs',
  'scripts/restore.mjs',
]) {
  if (existsSync(join(root, path))) copy(path);
}

const pkg = readJson('package.json');
// npm_node_execpath : contourne le relais nodenv de l'hébergeur.
const nodeScript = (command) => `"$npm_node_execpath" ${command}`;
writeJson(join(staging, 'package.json'), {
  name: pkg.name,
  version: pkg.version,
  private: true,
  description: pkg.description,
  type: 'module',
  engines: pkg.engines,
  workspaces: ['packages/*', 'apps/*'],
  scripts: {
    start: nodeScript('app.cjs'),
    'db:deploy': nodeScript('scripts/migrate.mjs'),
    'db:status': nodeScript('scripts/migrate.mjs --status'),
    'db:check': nodeScript('scripts/db-check.mjs'),
    'admin:promote': nodeScript('scripts/admin.mjs promote'),
    'admin:demote': nodeScript('scripts/admin.mjs demote'),
    'uploads:cleanup': nodeScript('scripts/cleanup-uploads.mjs'),
    backup: nodeScript('scripts/backup.mjs'),
    restore: nodeScript('scripts/restore.mjs'),
  },
  allowScripts: { 'argon2@0.45.1': true },
});
const api = readJson('apps/api/package.json');
delete api.devDependencies;
api.scripts = { start: 'node src/server.js' };
writeJson(join(staging, 'apps/api/package.json'), api);
const web = readJson('apps/web/package.json');
writeJson(join(staging, 'apps/web/package.json'), { name: web.name, version: web.version, private: true, type: 'module', description: 'Interface déjà construite (dist/).' });
// Pas de scripts d'installation (binaires précompilés).
writeFileSync(join(staging, '.npmrc'), '# Pas de scripts d’installation : argon2 et sharp sont fournis précompilés.\nignore-scripts=true\n');
cpSync(join(root, 'deploy/production.env.example'), join(staging, '.env.example'));
writeFileSync(join(staging, 'VERSION.txt'), `ExpoSpace — archive du ${new Date().toISOString()}\n`);

// Vérification des imports de l'archive.
function checkImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'generated'].includes(entry.name)) checkImports(path);
    } else if (/\.(m?js|cjs)$/.test(entry.name)) {
      const code = readFileSync(path, 'utf8');
      for (const [, spec] of code.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
        if (!existsSync(resolve(dirname(path), spec))) throw new Error(`Import introuvable dans l'archive : ${spec} (depuis ${path.slice(staging.length + 1)})`);
      }
      if (path.startsWith(join(staging, 'scripts'))) {
        for (const [, spec] of code.matchAll(/(?:from|import\()\s*'([^'./][^']*)'/g)) {
          if (!spec.startsWith('node:')) throw new Error(`Import de paquet interdit dans ${path.slice(staging.length + 1)} : '${spec}' (passer par apps/api)`);
        }
      }
    }
  }
}
checkImports(staging);

console.log('3/4 Archive zip');
mkdirSync(join(root, 'release'), { recursive: true });
const zipPath = join(root, 'release', `expospace-${stamp}.zip`);
rmSync(zipPath, { force: true });
run('zip', ['-qr', zipPath, '.'], staging);

console.log('4/4 Terminé');
const size = (spawnSync('du', ['-h', zipPath], { encoding: 'utf8' }).stdout || '').split('\t')[0];
console.log(`Archive prête : ${zipPath} (${size})`);
console.log('Déposer son CONTENU dans le dossier de l’application sur Plesk (guide de déploiement de l’équipe).');
