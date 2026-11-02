// Format des réponses : ni hash, ni session, ni chemin serveur.
import { exhibitionEtag } from '@expospace/shared/limits.js';
import { slotIndex } from '@expospace/shared/roomLayout.js';

export function publicUser(user) {
  return {
    id: user.id,
    username: user.usernameKey,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export const imageUrl = (artworkId, variant = 'full') => `/api/artworks/${artworkId}/image?variant=${variant}`;

const iso = (date) => (date ? date.toISOString() : null);

function studioArtwork(a) {
  return {
    id: a.id,
    title: a.title,
    artistName: a.artistName,
    description: a.description,
    altText: a.altText,
    widthPx: a.widthPx,
    heightPx: a.heightPx,
    byteSize: a.byteSize,
    createdAt: iso(a.createdAt),
    imageUrl: imageUrl(a.id, 'full'),
    thumbnailUrl: imageUrl(a.id, 'thumb'),
  };
}

const bySlot = (a, b) => slotIndex(a.slotCode) - slotIndex(b.slotCode);

export function studioExhibition(ex) {
  const rooms = [...ex.rooms].sort((a, b) => a.position - b.position);
  return {
    id: ex.id,
    title: ex.title,
    description: ex.description,
    status: ex.status,
    suspended: Boolean(ex.suspendedAt),
    version: ex.version,
    etag: exhibitionEtag(ex.id, ex.version),
    coverArtworkId: ex.coverArtworkId,
    publishedAt: iso(ex.publishedAt),
    createdAt: iso(ex.createdAt),
    updatedAt: iso(ex.updatedAt),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, position: r.position, wallColor: r.wallColor })),
    artworks: [...ex.artworks].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(studioArtwork),
    placements: rooms.flatMap((r) =>
      [...r.placements].sort(bySlot).map((p) => ({ roomId: p.roomId, artworkId: p.artworkId, slotCode: p.slotCode })),
    ),
    doors: rooms.flatMap((r) => [...(r.doors ?? [])].sort(bySlot).map((d) => ({ roomId: d.roomId, slotCode: d.slotCode, targetRoomId: d.targetRoomId }))),
  };
}

export function dashboardExhibition(ex) {
  return {
    id: ex.id,
    title: ex.title,
    status: ex.status,
    suspended: Boolean(ex.suspendedAt),
    version: ex.version,
    etag: exhibitionEtag(ex.id, ex.version),
    coverThumbnailUrl: ex.coverArtworkId ? imageUrl(ex.coverArtworkId, 'thumb') : null,
    artworkCount: ex._count.artworks,
    placedCount: ex.rooms.reduce((n, r) => n + r._count.placements, 0),
    roomCount: ex.rooms.length,
    publishedAt: iso(ex.publishedAt),
    updatedAt: iso(ex.updatedAt),
  };
}

export function catalogCard(ex) {
  return {
    id: ex.id,
    title: ex.title,
    creator: ex.owner.displayName,
    artworkCount: ex.rooms.reduce((n, r) => n + r._count.placements, 0),
    cover: ex.coverArtwork ? { url: imageUrl(ex.coverArtwork.id, 'thumb'), alt: ex.coverArtwork.altText } : null,
    publishedAt: iso(ex.publishedAt),
  };
}

export function publicExhibition(ex) {
  const rooms = [...ex.rooms].sort((a, b) => a.position - b.position);
  const cover = ex.coverArtwork;
  return {
    id: ex.id,
    title: ex.title,
    description: ex.description,
    creator: ex.owner.displayName,
    publishedAt: iso(ex.publishedAt),
    cover: cover ? { url: imageUrl(cover.id, 'full'), thumbnailUrl: imageUrl(cover.id, 'thumb'), alt: cover.altText } : null,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      wallColor: r.wallColor,
      doors: [...(r.doors ?? [])].sort(bySlot).map((d) => ({ slotCode: d.slotCode, targetRoomId: d.targetRoomId })),
      placements: [...r.placements].sort(bySlot).map((p) => ({
        slotCode: p.slotCode,
        artwork: {
          id: p.artwork.id,
          title: p.artwork.title,
          artistName: p.artwork.artistName,
          description: p.artwork.description,
          altText: p.artwork.altText,
          widthPx: p.artwork.widthPx,
          heightPx: p.artwork.heightPx,
          imageUrl: imageUrl(p.artwork.id, 'full'),
          thumbnailUrl: imageUrl(p.artwork.id, 'thumb'),
        },
      })),
    })),
  };
}
