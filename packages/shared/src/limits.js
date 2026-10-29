// Limites et constantes partagées.
const MIB = 1024 * 1024;

export const LIMITS = Object.freeze({
  usernameMin: 3,
  usernameMax: 30,
  displayNameMax: 60,
  passwordMin: 12,
  passwordMax: 128,
  sessionDays: 7,

  exhibitionsPerUser: 10,
  roomsPerExhibition: 3,
  slotsPerRoom: 12,
  artworksPerExhibition: 36,
  exhibitionTitleMax: 120,
  exhibitionDescriptionMax: 3000,
  roomNameMax: 60,
  artworkTitleMax: 120,
  artworkArtistMax: 120,
  artworkDescriptionMax: 3000,
  artworkAltMax: 300,

  uploadMaxBytes: 8 * MIB,
  uploadMaxPixels: 20_000_000,
  imageFullMaxSide: 2048,
  imageThumbMaxSide: 480,
  variantsMaxBytes: 2 * MIB,
  storagePerUserBytes: 250 * MIB,
  uploadsPerUser: 1,
  uploadsPerProcess: 2,

  catalogPageSize: 12,
});

export const ACCEPTED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export const WALL_COLORS = Object.freeze([
  { key: 'white', label: 'Blanc cassé', hex: '#f2efe9' },
  { key: 'grey', label: 'Gris perle', hex: '#d6d5d1' },
  { key: 'sage', label: 'Vert sauge', hex: '#b9c4b0' },
  { key: 'blue', label: 'Bleu nuit', hex: '#2f3f56' },
  { key: 'terracotta', label: 'Terracotta', hex: '#b87458' },
  { key: 'anthracite', label: 'Anthracite', hex: '#3a3a3c' },
]);

export const DEFAULT_WALL_COLOR = 'white';

export function wallColorHex(key) {
  return (WALL_COLORS.find((c) => c.key === key) ?? WALL_COLORS[0]).hex;
}

export function isWallColor(key) {
  return WALL_COLORS.some((c) => c.key === key);
}

export const EXHIBITION_STATUS = Object.freeze({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' });

export function exhibitionEtag(id, version) {
  return `"exhibition-${id}-v${version}"`;
}

export function parseExhibitionEtag(value) {
  const match = /^"exhibition-([0-9a-f-]{36})-v(\d{1,9})"$/.exec(String(value ?? '').trim());
  return match ? { id: match[1], version: Number(match[2]) } : null;
}
