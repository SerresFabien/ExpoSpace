// Géométrie de la salle (API et interface).
// Repère : Y vertical, origine au centre du sol.
export const ROOM = Object.freeze({ width: 12, depth: 10, height: 3.4 });

export const EYE_HEIGHT = 1.65;

const Y = EYE_HEIGHT;
const HALF_PI = Math.PI / 2;

// Douze places, dans l'ordre de visite.
export const SLOTS = Object.freeze(
  [
    { code: 'N1', wall: 'N', x: -3, y: Y, z: -4.96, rotationY: 0 },
    { code: 'N2', wall: 'N', x: 0, y: Y, z: -4.96, rotationY: 0 },
    { code: 'N3', wall: 'N', x: 3, y: Y, z: -4.96, rotationY: 0 },
    { code: 'E1', wall: 'E', x: 5.96, y: Y, z: -2.5, rotationY: -HALF_PI },
    { code: 'E2', wall: 'E', x: 5.96, y: Y, z: 0, rotationY: -HALF_PI },
    { code: 'E3', wall: 'E', x: 5.96, y: Y, z: 2.5, rotationY: -HALF_PI },
    { code: 'S1', wall: 'S', x: 3, y: Y, z: 4.96, rotationY: Math.PI },
    { code: 'S2', wall: 'S', x: 0, y: Y, z: 4.96, rotationY: Math.PI },
    { code: 'S3', wall: 'S', x: -3, y: Y, z: 4.96, rotationY: Math.PI },
    { code: 'W1', wall: 'W', x: -5.96, y: Y, z: 2.5, rotationY: HALF_PI },
    { code: 'W2', wall: 'W', x: -5.96, y: Y, z: 0, rotationY: HALF_PI },
    { code: 'W3', wall: 'W', x: -5.96, y: Y, z: -2.5, rotationY: HALF_PI },
  ].map((slot) => Object.freeze(slot)),
);

export const SLOT_CODES = Object.freeze(SLOTS.map((s) => s.code));

export const WALL_LABELS = Object.freeze({ N: 'Mur nord', E: 'Mur est', S: 'Mur sud', W: 'Mur ouest' });

const SLOT_BY_CODE = new Map(SLOTS.map((s) => [s.code, s]));

export function isSlotCode(code) {
  return typeof code === 'string' && SLOT_BY_CODE.has(code);
}

export function getSlot(code) {
  return SLOT_BY_CODE.get(code) ?? null;
}

export function slotIndex(code) {
  return SLOT_CODES.indexOf(code);
}

export const CAMERA_START = Object.freeze({ x: 0, y: EYE_HEIGHT, z: 2, yaw: 0, pitch: 0 });

export const WALK_BOUNDS = Object.freeze({ minX: -5.7, maxX: 5.7, minZ: -4.7, maxZ: 4.7 });
export const WALK_SPEED = 2.5;
export const COLLISION_RADIUS = 0.25;
export const MAX_DELTA = 0.05;
export const PITCH_LIMIT = 1.2;

// Porte : même place qu'un tableau, posée au sol.
export const DOOR_WIDTH = 1.2;
export const DOOR_HEIGHT = 2.2;
export const PICTURE_MAX = 1.8;
export const FRAME_BORDER = 0.04;

// Image contenue dans un carré de 1,80 m, sans déformation.
export function pictureSize(widthPx, heightPx) {
  const ratio = widthPx > 0 && heightPx > 0 ? widthPx / heightPx : 1;
  const width = Math.min(PICTURE_MAX, PICTURE_MAX * ratio);
  return { width, height: width / ratio };
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function clampToRoom({ x, z }) {
  return { x: clamp(x, WALK_BOUNDS.minX, WALK_BOUNDS.maxX), z: clamp(z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ) };
}

export function forwardVector(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

// Déplacement borné aux murs (pas de 50 ms maximum).
export function stepMovement(position, { forward = 0, strafe = 0 }, yaw, delta) {
  const dt = clamp(delta, 0, MAX_DELTA);
  const f = forwardVector(yaw);
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  let dx = forward * f.x + strafe * right.x;
  let dz = forward * f.z + strafe * right.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return clampToRoom(position);
  dx /= length;
  dz /= length;
  return clampToRoom({ x: position.x + dx * WALK_SPEED * dt, z: position.z + dz * WALK_SPEED * dt });
}

// Arrivée devant une porte, dos à elle.
export function arrivalAtDoor(code) {
  const view = viewpointForSlot(code, 1.4);
  return view && { ...view, yaw: view.yaw + Math.PI };
}

export function viewpointForSlot(code, distance = 2.4) {
  const slot = getSlot(code);
  if (!slot) return null;
  const nx = Math.sin(slot.rotationY);
  const nz = Math.cos(slot.rotationY);
  const p = clampToRoom({ x: slot.x + nx * distance, z: slot.z + nz * distance });
  return { x: p.x, z: p.z, yaw: slot.rotationY, pitch: 0 };
}
