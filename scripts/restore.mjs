// Restauration dans une base vide.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from '../apps/api/src/config.js';
import { prisma } from '../apps/api/src/db/prisma.js';
import { absoluteUploadPath } from '../apps/api/src/services/images.js';
import { readTarGz } from './lib/tar.mjs';

const archive = process.argv[2];
if (!archive || !existsSync(archive)) {
  console.error('Usage : npm run restore -- <chemin/vers/expospace-AAAAMMJJ-HHMMSS.tar.gz>');
  process.exit(1);
}

const toDate = (value) => (value ? new Date(value) : null);

// Ancien format : portes dans Room.
function doorsOf(data) {
  if (data.doors) return data.doors;
  const doors = [];
  for (const room of data.rooms) {
    for (const [field, step] of [['nextDoorSlot', 1], ['previousDoorSlot', -1]]) {
      const target = data.rooms.find((r) => r.exhibitionId === room.exhibitionId && r.position === room.position + step);
      if (room[field] && target) doors.push({ id: randomUUID(), roomId: room.id, slotCode: room[field], targetRoomId: target.id });
    }
  }
  return doors;
}

try {
  // Refus si la base contient déjà des comptes.
  if ((await prisma.user.count()) > 0) {
    console.error('Refus : la base cible contient déjà des comptes. Restaurez dans une base vide (jamais par-dessus la production).');
    process.exitCode = 1;
  } else {
    await mkdir(config.uploadDir, { recursive: true });
    let data = null;
    let files = 0;
    await readTarGz(archive, async (name, content) => {
      if (name === 'data.json') data = JSON.parse(content.toString('utf8'));
      else if (name.startsWith('uploads/')) {
        await writeFile(absoluteUploadPath(basename(name)), content);
        files += 1;
      }
    });
    if (data?.format !== 'expospace-backup') throw new Error('Archive invalide : data.json absent ou inconnu.');

    await prisma.$transaction(
      async (tx) => {
        await tx.user.createMany({ data: data.users.map((u) => ({ ...u, suspendedAt: toDate(u.suspendedAt), createdAt: toDate(u.createdAt) })) });
        await tx.exhibition.createMany({
          data: data.exhibitions.map((e) => ({
            ...e,
            coverArtworkId: null,
            publishedAt: toDate(e.publishedAt),
            suspendedAt: toDate(e.suspendedAt),
            createdAt: toDate(e.createdAt),
            updatedAt: toDate(e.updatedAt),
          })),
        });
        await tx.room.createMany({ data: data.rooms.map(({ nextDoorSlot: _next, previousDoorSlot: _previous, ...room }) => room) });
        await tx.artwork.createMany({ data: data.artworks.map((a) => ({ ...a, createdAt: toDate(a.createdAt) })) });
        await tx.placement.createMany({ data: data.placements });
        await tx.door.createMany({ data: doorsOf(data) });
        for (const e of data.exhibitions.filter((x) => x.coverArtworkId)) {
          await tx.exhibition.update({ where: { id: e.id }, data: { coverArtworkId: e.coverArtworkId, updatedAt: toDate(e.updatedAt) } });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    console.log(`Restauration terminée depuis ${basename(archive)} (sauvegarde du ${data.createdAt}) :`);
    console.log(`  ${data.users.length} comptes, ${data.exhibitions.length} expositions, ${data.rooms.length} salles, ${data.artworks.length} œuvres, ${data.placements.length} placements, ${doorsOf(data).length} portes, ${files} fichiers d'images.`);
    console.log('  Les sessions ne sont pas restaurées : chacun se reconnecte.');
  }
} finally {
  await prisma.$disconnect();
}
