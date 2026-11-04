// Conditions de publication (API et studio).
import { isSlotCode } from './roomLayout.js';

export function isArtworkReady(artwork) {
  return Boolean(artwork?.title?.trim() && artwork?.altText?.trim());
}

export function publicationProblems(exhibition) {
  const problems = [];
  const artworks = new Map(exhibition.artworks.map((a) => [a.id, a]));
  const roomIds = new Set(exhibition.rooms.map((r) => r.id));
  const placedIds = new Set(exhibition.placements.map((p) => p.artworkId));

  if (!exhibition.title?.trim()) problems.push({ key: 'title', message: 'Le titre est obligatoire.' });

  for (const p of exhibition.placements) {
    if (!roomIds.has(p.roomId) || !artworks.has(p.artworkId) || !isSlotCode(p.slotCode)) {
      problems.push({ key: `placement:${p.artworkId}`, message: 'Un placement est invalide : réenregistrez la salle.' });
    }
  }

  // Chaque salle doit être accessible depuis la première.
  const doors = exhibition.doors ?? [];
  const rooms = [...exhibition.rooms].sort((a, b) => a.position - b.position);
  if (rooms.length > 1) {
    const reached = new Set([rooms[0].id]);
    const queue = [rooms[0].id];
    while (queue.length) {
      const from = queue.shift();
      for (const d of doors) {
        if (d.roomId === from && roomIds.has(d.targetRoomId) && !reached.has(d.targetRoomId)) {
          reached.add(d.targetRoomId);
          queue.push(d.targetRoomId);
        }
      }
    }
    for (const room of rooms.filter((r) => !reached.has(r.id))) {
      problems.push({ key: `door:${room.id}`, message: `Aucune porte ne mène à « ${room.name} » depuis « ${rooms[0].name} » : posez une porte.` });
    }
  }

  for (const room of exhibition.rooms) {
    const inRoom = exhibition.placements.filter((p) => p.roomId === room.id);
    if (!inRoom.some((p) => isArtworkReady(artworks.get(p.artworkId)))) {
      problems.push({ key: `room:${room.id}`, message: `La salle « ${room.name} » doit contenir au moins une œuvre prête (titre et texte alternatif).` });
    }
  }

  for (const id of placedIds) {
    const art = artworks.get(id);
    if (art && !isArtworkReady(art)) {
      const name = art.title?.trim() ? `« ${art.title.trim()} »` : 'sans titre';
      problems.push({ key: `artwork:${id}`, message: `L’œuvre ${name} est placée mais n’a pas de titre ou de texte alternatif.` });
    }
  }

  if (!exhibition.coverArtworkId) {
    problems.push({ key: 'cover', message: 'Choisissez une couverture parmi les œuvres placées.' });
  } else if (!placedIds.has(exhibition.coverArtworkId)) {
    problems.push({ key: 'cover', message: 'La couverture doit être une œuvre placée dans une salle.' });
  }

  return problems;
}
