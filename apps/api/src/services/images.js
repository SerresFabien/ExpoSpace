// Contrôle et conversion des images en WebP.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { LIMITS } from '@expospace/shared/limits.js';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

sharp.cache(false);
sharp.concurrency(1);

const rejected = (status, code, message) => new AppError(status, code, message);

export function ensureStorageDirs() {
  mkdirSync(config.uploadDir, { recursive: true });
  mkdirSync(config.tmpDir, { recursive: true });
}

export async function sniffImageType(path) {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    const b = buf.subarray(0, bytesRead);
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
  } finally {
    await fh.close();
  }
}

const QUALITIES = [84, 74, 62];

async function render(path, maxSide, quality) {
  return sharp(path, { limitInputPixels: LIMITS.uploadMaxPixels, failOn: 'error', sequentialRead: true })
    .timeout({ seconds: 60 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
}

export async function normalizeImage(path) {
  const type = await sniffImageType(path);
  if (!type) throw rejected(415, 'unsupported_format', 'Format refusé : seules les images JPEG, PNG et WebP sont acceptées.');

  let meta;
  try {
    // Pixels vérifiés avant le décodage complet.
    meta = await sharp(path, { limitInputPixels: false, failOn: 'error' }).metadata();
  } catch {
    throw rejected(422, 'decode_failed', 'Image illisible ou corrompue.');
  }
  if (meta.format !== type) throw rejected(415, 'unsupported_format', 'Le contenu du fichier ne correspond pas à une image JPEG, PNG ou WebP.');
  if ((meta.pages ?? 1) > 1) throw rejected(422, 'animated_image', 'Les images animées ne sont pas acceptées.');
  if (!meta.width || !meta.height) throw rejected(422, 'decode_failed', 'Dimensions de l’image illisibles.');
  if (meta.width * meta.height > LIMITS.uploadMaxPixels) {
    throw rejected(422, 'too_many_pixels', `L’image dépasse ${LIMITS.uploadMaxPixels / 1e6} millions de pixels.`);
  }

  for (const quality of QUALITIES) {
    let full;
    let thumb;
    try {
      full = await render(path, LIMITS.imageFullMaxSide, quality);
      thumb = await render(path, LIMITS.imageThumbMaxSide, Math.min(quality, 78));
    } catch {
      throw rejected(422, 'decode_failed', 'Le décodage complet de l’image a échoué.');
    }
    const byteSize = full.data.length + thumb.data.length;
    if (byteSize <= LIMITS.variantsMaxBytes) {
      return { full: full.data, thumb: thumb.data, widthPx: full.info.width, heightPx: full.info.height, byteSize };
    }
  }
  throw rejected(422, 'image_too_heavy', 'Cette image reste trop lourde après compression (plus de 2 Mio). Essayez une image moins détaillée.');
}

export async function storeVariants({ full, thumb }) {
  const imagePath = `${randomUUID()}.webp`;
  const thumbnailPath = `${randomUUID()}.webp`;
  await writeFile(absoluteUploadPath(imagePath), full, { flag: 'wx' });
  try {
    await writeFile(absoluteUploadPath(thumbnailPath), thumb, { flag: 'wx' });
  } catch (err) {
    await removeUploads([imagePath]);
    throw err;
  }
  return { imagePath, thumbnailPath };
}

export function absoluteUploadPath(relative) {
  return join(config.uploadDir, basename(relative));
}

export async function removeUploads(paths) {
  await Promise.all(paths.filter(Boolean).map((p) => rm(absoluteUploadPath(p), { force: true }).catch(() => {})));
}

const activeUsers = new Set();

export function acquireUploadSlot(userId) {
  if (activeUsers.has(userId)) {
    throw new AppError(429, 'upload_busy', 'Un import est déjà en cours pour votre compte : attendez qu’il se termine.');
  }
  if (activeUsers.size >= LIMITS.uploadsPerProcess) {
    throw new AppError(429, 'upload_busy', 'Le serveur traite déjà d’autres images. Réessayez dans quelques secondes.');
  }
  activeUsers.add(userId);
  let released = false;
  return () => {
    if (!released) activeUsers.delete(userId);
    released = true;
  };
}
