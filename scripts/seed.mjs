// Données de démonstration.
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../apps/api/src/config.js';
import { prisma } from '../apps/api/src/db/prisma.js';
import * as accounts from '../apps/api/src/services/accounts.js';
import * as artworks from '../apps/api/src/services/artworks.js';
import * as exhibitions from '../apps/api/src/services/exhibitions.js';
import { ensureStorageDirs } from '../apps/api/src/services/images.js';
import { closeSessionStore } from '../apps/api/src/middleware/session.js';
import { DEMO_ARTWORKS, demoImage } from './lib/demoImages.mjs';

if (config.isProd) {
  console.error('Refus : les données de démonstration ne sont jamais chargées en production.');
  process.exit(1);
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  console.error('Définissez SEED_PASSWORD (au moins 12 caractères) dans .env : mot de passe commun des comptes de démonstration.');
  process.exit(1);
}

ensureStorageDirs();

async function addArtwork(owner, ex, index, meta) {
  const tmp = join(config.tmpDir, `seed-${Date.now()}-${index}.jpg`);
  await writeFile(tmp, await demoImage(index));
  try {
    const { title, artistName, altText } = meta;
    const result = await artworks.createFromUpload(owner.id, ex.id, ex.etag, tmp, { title, artistName, altText, rightsConfirmed: 'true' });
    return result;
  } finally {
    await rm(tmp, { force: true });
  }
}

async function buildExhibition(owner, { title, description, roomName, wallColor, items, publish }) {
  let ex = await exhibitions.createExhibition(owner.id, { title, description });
  ex = (await exhibitions.updateRoom(owner.id, ex.id, ex.rooms[0].id, ex.etag, { name: roomName, wallColor })).exhibition;
  const ids = [];
  for (const { index, slot, description: text } of items) {
    const meta = DEMO_ARTWORKS[index % DEMO_ARTWORKS.length];
    const res = await addArtwork(owner, ex, index, meta);
    ex = res.exhibition;
    if (text) ex = (await artworks.updateArtwork(owner.id, ex.id, res.artworkId, ex.etag, { description: text })).exhibition;
    ids.push({ id: res.artworkId, slot });
  }
  const placements = ids.filter((a) => a.slot).map((a) => ({ roomId: ex.rooms[0].id, artworkId: a.id, slotCode: a.slot }));
  ex = (await exhibitions.replacePlacements(owner.id, ex.id, ex.etag, { placements })).exhibition;
  if (placements.length) ex = (await exhibitions.updateExhibition(owner.id, ex.id, ex.etag, { coverArtworkId: placements[0].artworkId })).exhibition;
  if (publish) ex = (await exhibitions.publish(owner.id, ex.id, ex.etag)).exhibition;
  return ex;
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { usernameKey: 'camille' } });
  if (existing) {
    console.log('Les données de démonstration existent déjà (compte « camille »). Rien à faire.');
    return;
  }

  const camille = (await accounts.register({ username: 'camille', displayName: 'Camille Martin', password })).user;
  const noah = (await accounts.register({ username: 'noah', displayName: 'Noah Bernard', password })).user;

  const lumieres = await buildExhibition(camille, {
    title: 'Lumières urbaines',
    description: 'Six compositions abstraites inspirées des lumières de la ville la nuit.\nIllustrations générées pour la démonstration d’ExpoSpace (libres de droits).',
    roomName: 'Entrée',
    wallColor: 'white',
    publish: true,
    items: [
      { index: 0, slot: 'N2', description: 'Les reflets des néons sur le trottoir mouillé, réduits à quelques formes.' },
      { index: 1, slot: 'E1' },
      { index: 2, slot: 'E3' },
      { index: 3, slot: 'S2', description: 'Une composition panoramique très contrastée.' },
      { index: 4, slot: 'W1' },
      { index: 5, slot: 'W3' },
    ],
  });

  const brouillon = await buildExhibition(camille, {
    title: 'Carnet en cours',
    description: 'Exposition en brouillon : visible uniquement par Camille.',
    roomName: 'Atelier',
    wallColor: 'grey',
    publish: false,
    items: [
      { index: 2, slot: 'N1' },
      { index: 5, slot: null },
    ],
  });

  const rivages = await buildExhibition(noah, {
    title: 'Rivages',
    description: 'Quatre variations de couleurs autour de la mer et de la terre.',
    roomName: 'Grande salle',
    wallColor: 'sage',
    publish: true,
    items: [
      { index: 5, slot: 'N1' },
      { index: 4, slot: 'N3' },
      { index: 1, slot: 'E2' },
      { index: 3, slot: 'W2' },
    ],
  });

  console.log('Données de démonstration créées (mot de passe : SEED_PASSWORD du fichier .env) :');
  console.log(`  camille : « ${lumieres.title} » (publiée, ${lumieres.placements.length} œuvres) et « ${brouillon.title} » (brouillon)`);
  console.log(`  noah    : « ${rivages.title} » (publiée, ${rivages.placements.length} œuvres)`);
  console.log('Aucun administrateur n’est créé. Pour en désigner un : npm run admin:promote -- <identifiant>');
}

try {
  await main();
} finally {
  await closeSessionStore();
  await prisma.$disconnect();
}
