// Œuvres : import, fiche, suppression.
import { LIMITS } from '@expospace/shared/limits.js';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { conflict, notFound, preconditionRequired, publishedLocked, versionConflict } from '../lib/errors.js';
import { parse, plainText, z } from '../lib/validate.js';
import { expectedVersion, writeExhibition } from './exhibitions.js';
import { normalizeImage, removeUploads, storeVariants } from './images.js';

const sheetFields = {
  title: plainText(LIMITS.artworkTitleMax),
  artistName: plainText(LIMITS.artworkArtistMax),
  description: plainText(LIMITS.artworkDescriptionMax),
  altText: plainText(LIMITS.artworkAltMax),
};

const uploadFieldsSchema = z.strictObject({
  title: sheetFields.title.optional(),
  artistName: sheetFields.artistName.optional(),
  description: sheetFields.description.optional(),
  altText: sheetFields.altText.optional(),
  rightsConfirmed: z.literal('true', { error: 'Confirmez que vous disposez des droits nécessaires sur cette image.' }),
});

const sheetSchema = z.strictObject({
  title: sheetFields.title.optional(),
  artistName: sheetFields.artistName.optional(),
  description: sheetFields.description.optional(),
  altText: sheetFields.altText.optional(),
});

const quotaExceeded = (message) => conflict('quota_exceeded', message);

async function storageUsed(tx, userId) {
  const sum = await tx.artwork.aggregate({ _sum: { byteSize: true }, where: { exhibition: { ownerId: userId } } });
  return sum._sum.byteSize ?? 0;
}

async function assertServerSpace(tx, extraBytes = 0) {
  if (!config.maxTotalStorageBytes) return;
  const sum = await tx.artwork.aggregate({ _sum: { byteSize: true } });
  if ((sum._sum.byteSize ?? 0) + extraBytes > config.maxTotalStorageBytes) {
    throw quotaExceeded('L’espace de stockage des images du site est plein pour le moment. Réessayez plus tard.');
  }
}

export async function precheckUpload(userId, exhibitionId, ifMatch) {
  const expected = expectedVersion(ifMatch, exhibitionId);
  const ex = await prisma.exhibition.findFirst({
    where: { id: exhibitionId, ownerId: userId },
    select: { version: true, status: true, _count: { select: { artworks: true } } },
  });
  if (!ex) throw notFound();
  if (expected === null) throw preconditionRequired();
  if (expected !== ex.version) throw versionConflict();
  if (ex.status === 'PUBLISHED') throw publishedLocked();
  if (ex._count.artworks >= LIMITS.artworksPerExhibition) {
    throw quotaExceeded(`Une exposition contient au plus ${LIMITS.artworksPerExhibition} œuvres.`);
  }
  if ((await storageUsed(prisma, userId)) >= LIMITS.storagePerUserBytes) {
    throw quotaExceeded('Votre espace de stockage d’images (250 Mio) est plein. Supprimez des œuvres inutilisées.');
  }
  await assertServerSpace(prisma);
}

export function parseUploadFields(body) {
  return parse(uploadFieldsSchema, body);
}

// Fichiers écrits avant la base, supprimés en cas d'échec.
export async function createFromUpload(userId, exhibitionId, ifMatch, tmpPath, fields) {
  const image = await normalizeImage(tmpPath);
  const files = await storeVariants(image);
  try {
    return await writeExhibition({ userId, exhibitionId, ifMatch, lockUser: true }, async (tx) => {
      const count = await tx.artwork.count({ where: { exhibitionId } });
      if (count >= LIMITS.artworksPerExhibition) throw quotaExceeded(`Une exposition contient au plus ${LIMITS.artworksPerExhibition} œuvres.`);
      if ((await storageUsed(tx, userId)) + image.byteSize > LIMITS.storagePerUserBytes) {
        throw quotaExceeded('Votre espace de stockage d’images (250 Mio) serait dépassé par cette image.');
      }
      await assertServerSpace(tx, image.byteSize);
      const artwork = await tx.artwork.create({
        data: {
          exhibitionId,
          title: fields.title ?? '',
          artistName: fields.artistName ?? '',
          description: fields.description ?? '',
          altText: fields.altText ?? '',
          imagePath: files.imagePath,
          thumbnailPath: files.thumbnailPath,
          widthPx: image.widthPx,
          heightPx: image.heightPx,
          byteSize: image.byteSize,
        },
        select: { id: true },
      });
      return { artworkId: artwork.id };
    });
  } catch (err) {
    await removeUploads([files.imagePath, files.thumbnailPath]);
    throw err;
  }
}

export async function updateArtwork(userId, exhibitionId, artworkId, ifMatch, body) {
  const data = parse(sheetSchema, body);
  return writeExhibition({ userId, exhibitionId, ifMatch }, async (tx) => {
    const art = await tx.artwork.findFirst({ where: { id: artworkId, exhibitionId } });
    if (!art) throw notFound();
    const patch = {};
    for (const key of Object.keys(sheetFields)) if (data[key] !== undefined && data[key] !== art[key]) patch[key] = data[key];
    if (Object.keys(patch).length === 0) return { changed: false };
    await tx.artwork.update({ where: { id: artworkId }, data: patch });
    return { changed: true };
  });
}

export async function deleteArtwork(userId, exhibitionId, artworkId, ifMatch) {
  const result = await writeExhibition({ userId, exhibitionId, ifMatch }, async (tx) => {
    const art = await tx.artwork.findFirst({ where: { id: artworkId, exhibitionId } });
    if (!art) throw notFound();
    await tx.exhibition.updateMany({ where: { id: exhibitionId, coverArtworkId: artworkId }, data: { coverArtworkId: null } });
    await tx.artwork.delete({ where: { id: artworkId } });
    return { files: [art.imagePath, art.thumbnailPath] };
  });
  await removeUploads(result.files);
  return result;
}
