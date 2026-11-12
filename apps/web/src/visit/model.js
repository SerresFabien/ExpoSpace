// Modèle de visite (3D et 2D).
import { useEffect, useState } from 'react';
import { slotIndex } from '@expospace/shared/roomLayout.js';
import { api } from '../lib/api.js';

// Portes avec le nom de leur destination.
function withDoors(rooms) {
  const names = new Map(rooms.map((r) => [r.id, r.name]));
  return rooms.map((room) => ({
    ...room,
    doors: room.doors.filter((d) => names.has(d.targetRoomId)).map((d) => ({ ...d, target: names.get(d.targetRoomId) })),
  }));
}

export function fromPublic(ex) {
  return {
    id: ex.id,
    title: ex.title,
    description: ex.description,
    creator: ex.creator,
    preview: false,
    rooms: withDoors(
      ex.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        wallColor: r.wallColor,
        doors: r.doors ?? [],
        items: r.placements.map((p) => ({ ...p.artwork, slotCode: p.slotCode })),
      })),
    ),
  };
}

export function fromStudio(ex, creator) {
  const artworks = new Map(ex.artworks.map((a) => [a.id, a]));
  return {
    id: ex.id,
    title: ex.title,
    description: ex.description,
    creator,
    preview: true,
    rooms: withDoors(
      ex.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        wallColor: r.wallColor,
        doors: (ex.doors ?? []).filter((d) => d.roomId === r.id),
        items: ex.placements
          .filter((p) => p.roomId === r.id && artworks.has(p.artworkId))
          .sort((a, b) => slotIndex(a.slotCode) - slotIndex(b.slotCode))
          .map((p) => ({ ...artworks.get(p.artworkId), slotCode: p.slotCode })),
      })),
    ),
  };
}

export function useVisitModel(id, { preview, creator }) {
  const [state, setState] = useState({ model: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState({ model: null, error: null, loading: true });
    const request = preview ? api(`/me/exhibitions/${id}`).then((r) => fromStudio(r.exhibition, creator)) : api(`/exhibitions/${id}`).then((r) => fromPublic(r.exhibition));
    request
      .then((model) => !cancelled && setState({ model, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ model: null, error, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [id, preview, creator]);
  return state;
}
