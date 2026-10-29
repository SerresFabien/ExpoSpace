import { describe, expect, it } from 'vitest';
import {
  CAMERA_START,
  SLOTS,
  SLOT_CODES,
  WALK_BOUNDS,
  clampToRoom,
  forwardVector,
  getSlot,
  isSlotCode,
  pictureSize,
  stepMovement,
  viewpointForSlot,
} from '../src/roomLayout.js';
import { exhibitionEtag, parseExhibitionEtag } from '../src/limits.js';

const close = (a, b) => expect(a).toBeCloseTo(b, 6);

describe('places de la salle (§7.2)', () => {
  it('liste exactement les douze codes dans l’ordre de visite', () => {
    expect(SLOT_CODES).toEqual(['N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3']);
  });

  it('rejette les codes inconnus', () => {
    expect(isSlotCode('N2')).toBe(true);
    for (const bad of ['N4', 'n1', '', null, undefined, 'X1', ' N1']) expect(isSlotCode(bad)).toBe(false);
  });

  it('place chaque tableau à 4 cm devant son mur, à 1,65 m de haut', () => {
    for (const s of SLOTS) {
      expect(s.y).toBe(1.65);
      if (s.wall === 'N') close(s.z, -4.96);
      if (s.wall === 'S') close(s.z, 4.96);
      if (s.wall === 'E') close(s.x, 5.96);
      if (s.wall === 'W') close(s.x, -5.96);
    }
  });

  it('oriente chaque tableau vers l’intérieur de la salle', () => {
    for (const s of SLOTS) {
      const nx = Math.sin(s.rotationY);
      const nz = Math.cos(s.rotationY);
      expect(nx * -s.x + nz * -s.z).toBeGreaterThan(0);
    }
    expect(getSlot('E2').rotationY).toBeCloseTo(-Math.PI / 2);
    expect(getSlot('S2').rotationY).toBeCloseTo(Math.PI);
    expect(getSlot('W2').rotationY).toBeCloseTo(Math.PI / 2);
  });
});

describe('taille des tableaux sans déformation (§7.2)', () => {
  it('paysage : largeur 1,80 m', () => {
    const s = pictureSize(1600, 900);
    close(s.width, 1.8);
    close(s.width / s.height, 1600 / 900);
  });

  it('portrait : hauteur 1,80 m', () => {
    const s = pictureSize(900, 1600);
    close(s.height, 1.8);
    close(s.width / s.height, 900 / 1600);
  });

  it('carré et dimensions invalides', () => {
    expect(pictureSize(500, 500)).toEqual({ width: 1.8, height: 1.8 });
    expect(pictureSize(0, 0)).toEqual({ width: 1.8, height: 1.8 });
  });
});

describe('déplacement et collisions (§7.3)', () => {
  it('démarre en (0 ; 1,65 ; 2) en regardant vers le nord', () => {
    expect(CAMERA_START).toMatchObject({ x: 0, y: 1.65, z: 2, yaw: 0 });
    const f = forwardVector(0);
    close(f.x, 0);
    close(f.z, -1);
  });

  it('avance à 2,5 m/s et borne le pas à 50 ms', () => {
    const p = stepMovement({ x: 0, z: 0 }, { forward: 1 }, 0, 0.02);
    close(p.z, -0.05);
    const long = stepMovement({ x: 0, z: 0 }, { forward: 1 }, 0, 3);
    close(long.z, -0.125);
  });

  it('ne va pas plus vite en diagonale', () => {
    const p = stepMovement({ x: 0, z: 0 }, { forward: 1, strafe: 1 }, 0, 0.04);
    close(Math.hypot(p.x, p.z), 0.1);
  });

  it('ne traverse aucun des quatre murs', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      let p = { x: 0, z: 0 };
      for (let i = 0; i < 500; i++) p = stepMovement(p, { forward: 1 }, yaw, 0.05);
      expect(p.x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX);
      expect(p.x).toBeLessThanOrEqual(WALK_BOUNDS.maxX);
      expect(p.z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ);
      expect(p.z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ);
    }
    expect(clampToRoom({ x: 99, z: -99 })).toEqual({ x: 5.7, z: -4.7 });
  });

  it('propose un point de vue face à chaque tableau', () => {
    for (const s of SLOTS) {
      const v = viewpointForSlot(s.code);
      const f = forwardVector(v.yaw);
      const toSlot = { x: s.x - v.x, z: s.z - v.z };
      expect(f.x * toSlot.x + f.z * toSlot.z).toBeGreaterThan(2);
    }
    expect(viewpointForSlot('Z9')).toBeNull();
  });
});

describe('ETag d’exposition (§11.1)', () => {
  it('fait l’aller-retour et refuse les formats inconnus', () => {
    const id = '2b8f3c8e-0f8e-4a41-9d61-2f6b9a1f4c10';
    const tag = exhibitionEtag(id, 7);
    expect(tag).toBe(`"exhibition-${id}-v7"`);
    expect(parseExhibitionEtag(tag)).toEqual({ id, version: 7 });
    for (const bad of [undefined, '', '*', 'exhibition-x-v1', `W/${tag}`, `"exhibition-${id}-v"`]) expect(parseExhibitionEtag(bad)).toBeNull();
  });
});
