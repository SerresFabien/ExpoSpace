// Sauvegarde de la base (sans sessions) et des images en .tar.gz.
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../apps/api/src/config.js';
import { prisma } from '../apps/api/src/db/prisma.js';
import { absoluteUploadPath } from '../apps/api/src/services/images.js';
import { writeTarGz } from './lib/tar.mjs';

const KEEP = 8;
const wait = process.argv.includes('--no-wait') ? 0 : 5000;
const start = Date.now();
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = join(config.backupDir, `expospace-${stamp}.tar.gz`);

await mkdir(config.backupDir, { recursive: true });
// Maintenance : écritures suspendues.
await writeFile(config.maintenanceFile, `sauvegarde ${stamp}\n`);
try {
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const migrations = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  const data = {
    format: 'expospace-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    migrations: migrations.map((m) => m.migration_name),
    users: await prisma.user.findMany(),
    exhibitions: await prisma.exhibition.findMany(),
    rooms: await prisma.room.findMany(),
    artworks: await prisma.artwork.findMany(),
    placements: await prisma.placement.findMany(),
    doors: await prisma.door.findMany(),
  };
  const entries = [];
  const missing = [];
  for (const art of data.artworks) {
    for (const name of [art.imagePath, art.thumbnailPath]) {
      const path = absoluteUploadPath(name);
      if (existsSync(path)) entries.push({ name: `uploads/${name}`, path });
      else missing.push(name);
    }
  }
  data.missingFiles = missing;
  entries.unshift({ name: 'data.json', data: Buffer.from(JSON.stringify(data, null, 2)) });
  await writeTarGz(target, entries);
  await rm(config.maintenanceFile, { force: true });

  const archives = (await readdir(config.backupDir)).filter((n) => /^expospace-\d{8}-\d{6}\.tar\.gz$/.test(n)).sort();
  for (const old of archives.slice(0, -KEEP)) await rm(join(config.backupDir, old), { force: true });

  const size = (await stat(target)).size;
  console.log(`Sauvegarde terminée en ${((Date.now() - start) / 1000).toFixed(1)} s : ${target} (${(size / 1048576).toFixed(1)} Mo)`);
  console.log(`  ${data.users.length} comptes, ${data.exhibitions.length} expositions, ${data.artworks.length} œuvres, ${entries.length - 1} fichiers d'images.`);
  if (missing.length) console.log(`  ATTENTION : ${missing.length} fichier(s) d'image introuvable(s), listés dans data.json (missingFiles).`);
  console.log('  Téléchargez maintenant cette archive hors de l’hébergement (gestionnaire de fichiers de Plesk).');
} finally {
  await rm(config.maintenanceFile, { force: true });
  await prisma.$disconnect();
}
