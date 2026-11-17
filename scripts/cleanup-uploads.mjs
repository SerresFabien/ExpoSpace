// Nettoyage des images orphelines et des fichiers temporaires.
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../apps/api/src/config.js';
import { prisma } from '../apps/api/src/db/prisma.js';

const apply = process.argv.includes('--apply');
const AGE_MS = 60 * 60 * 1000;

async function oldFiles(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const result = [];
  for (const name of names) {
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info?.isFile() && Date.now() - info.mtimeMs > AGE_MS) result.push({ name, path });
  }
  return result;
}

try {
  const rows = await prisma.artwork.findMany({ select: { imagePath: true, thumbnailPath: true } });
  const referenced = new Set(rows.flatMap((r) => [r.imagePath, r.thumbnailPath]));
  const orphans = (await oldFiles(config.uploadDir)).filter((f) => !referenced.has(f.name));
  const temporary = await oldFiles(config.tmpDir);
  for (const f of [...orphans, ...temporary]) {
    console.log(`${apply ? 'suppression' : 'à supprimer'} : ${f.path}`);
    if (apply) await rm(f.path, { force: true });
  }
  console.log(`${orphans.length} image(s) orpheline(s), ${temporary.length} fichier(s) temporaire(s).${apply ? '' : ' Relancez avec --apply pour supprimer.'}`);
} finally {
  await prisma.$disconnect();
}
