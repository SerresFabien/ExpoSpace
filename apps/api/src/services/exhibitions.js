// Expositions : création, salles, placements, publication, suppression.
import { DEFAULT_WALL_COLOR, EXHIBITION_STATUS, LIMITS, isWallColor, parseExhibitionEtag } from '@expospace/shared/limits.js';
import { publicationProblems } from '@expospace/shared/publication.js';
import { SLOT_CODES, isSlotCode } from '@expospace/shared/roomLayout.js';
import { prisma, transaction } from '../db/prisma.js';
import { AppError, badRequest, conflict, notFound, preconditionRequired, publishedLocked, versionConflict } from '../lib/errors.js';
import { parse, plainText, z } from '../lib/validate.js';
import { dashboardExhibition, studioExhibition } from './presenters.js';

const STUDIO_INCLUDE = {
  rooms: { include: { placements: true, doors: true }, orderBy: { position: 'asc' } },
  artworks: true,
};

export function expectedVersion(ifMatch, id) {
  if (ifMatch === undefined || ifMatch === null || ifMatch === '') return null;
  const tag = parseExhibitionEtag(ifMatch);
  return tag && tag.id === id ? tag.version : -1;
}

// Contrôles : propriétaire (404), If-Match (428), version (412), brouillon (409).
// Ligne verrouillée ; version incrémentée seulement en cas de changement.
export async function writeExhibition({ userId, exhibitionId, ifMatch, requireDraft = true, lockUser = false }, fn) {
  const expected = expectedVersion(ifMatch, exhibitionId);
  return transaction(async (tx) => {
    // Compte puis exposition : ordre fixe contre les interblocages.
    if (lockUser) await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
    const rows = await tx.$queryRaw`
      SELECT id, ownerId, status, version, suspendedAt
      FROM \`Exhibition\` WHERE id = ${exhibitionId} FOR UPDATE`;
    const ex = rows[0] && { ...rows[0], version: Number(rows[0].version) };
    if (!ex || ex.ownerId !== userId) throw notFound();
    if (expected === null) throw preconditionRequired();
    if (expected !== ex.version) throw versionConflict();
    if (requireDraft && ex.status === EXHIBITION_STATUS.PUBLISHED) throw publishedLocked();

    const result = (await fn(tx, ex)) ?? {};
    if (result.deleted) return result;
    const changed = result.changed !== false;
    const updated = changed
      ? await tx.exhibition.update({ where: { id: exhibitionId }, data: { version: { increment: 1 } }, include: STUDIO_INCLUDE })
      : await tx.exhibition.findUnique({ where: { id: exhibitionId }, include: STUDIO_INCLUDE });
    return { ...result, exhibition: studioExhibition(updated) };
  });
}

export async function listMine(userId) {
  const rows = await prisma.exhibition.findMany({
    where: { ownerId: userId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { _count: { select: { artworks: true } }, rooms: { select: { _count: { select: { placements: true } } } } },
  });
  return rows.map(dashboardExhibition);
}

export async function getStudio(userId, id) {
  const ex = await prisma.exhibition.findFirst({ where: { id, ownerId: userId }, include: STUDIO_INCLUDE });
  if (!ex) throw notFound();
  return studioExhibition(ex);
}

const titleField = plainText(LIMITS.exhibitionTitleMax).pipe(z.string().min(1, 'Le titre est obligatoire.'));
const descriptionField = plainText(LIMITS.exhibitionDescriptionMax);

const createSchema = z.strictObject({ title: titleField, description: descriptionField.optional() });

export async function createExhibition(userId, body) {
  const data = parse(createSchema, body);
  const ex = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
    const count = await tx.exhibition.count({ where: { ownerId: userId } });
    if (count >= LIMITS.exhibitionsPerUser) {
      throw conflict('quota_exceeded', `Vous avez atteint la limite de ${LIMITS.exhibitionsPerUser} expositions.`);
    }
    return tx.exhibition.create({
      data: {
        ownerId: userId,
        title: data.title,
        description: data.description ?? '',
        rooms: { create: { name: 'Salle 1', position: 1, wallColor: DEFAULT_WALL_COLOR } },
      },
      include: STUDIO_INCLUDE,
    });
  });
  return studioExhibition(ex);
}

const updateSchema = z.strictObject({
  title: titleField.optional(),
  description: descriptionField.optional(),
  coverArtworkId: z.uuid('Œuvre inconnue.').nullable().optional(),
});

export async function updateExhibition(userId, id, ifMatch, body) {
  const data = parse(updateSchema, body);
  return writeExhibition({ userId, exhibitionId: id, ifMatch }, async (tx) => {
    const current = await tx.exhibition.findUnique({ where: { id } });
    if (data.coverArtworkId) {
      const art = await tx.artwork.findFirst({ where: { id: data.coverArtworkId, exhibitionId: id }, select: { id: true } });
      if (!art) throw badRequest('validation_failed', 'Certaines informations sont invalides.', { coverArtworkId: 'Cette œuvre n’appartient pas à l’exposition.' });
    }
    const patch = {};
    for (const key of ['title', 'description', 'coverArtworkId']) {
      if (data[key] !== undefined && data[key] !== current[key]) patch[key] = data[key];
    }
    if (Object.keys(patch).length === 0) return { changed: false };
    await tx.exhibition.update({ where: { id }, data: patch });
    return { changed: true };
  });
}

const roomSchema = z.strictObject({
  name: plainText(LIMITS.roomNameMax).pipe(z.string().min(1, 'Le nom de la salle est obligatoire.')).optional(),
  wallColor: z
    .string()
    .refine(isWallColor, 'Couleur inconnue.')
    .optional(),
});

export async function updateRoom(userId, id, roomId, ifMatch, body) {
  const data = parse(roomSchema, body);
  return writeExhibition({ userId, exhibitionId: id, ifMatch }, async (tx) => {
    const room = await tx.room.findFirst({ where: { id: roomId, exhibitionId: id } });
    if (!room) throw notFound();
    const patch = {};
    if (data.name !== undefined && data.name !== room.name) patch.name = data.name;
    if (data.wallColor !== undefined && data.wallColor !== room.wallColor) patch.wallColor = data.wallColor;
    if (Object.keys(patch).length === 0) return { changed: false };
    await tx.room.update({ where: { id: roomId }, data: patch });
    return { changed: true };
  });
}

const newRoomSchema = z.strictObject({
  name: plainText(LIMITS.roomNameMax).pipe(z.string().min(1, 'Le nom de la salle est obligatoire.')).optional(),
});

export async function addRoom(userId, id, ifMatch, body) {
  const data = parse(newRoomSchema, body ?? {});
  return writeExhibition({ userId, exhibitionId: id, ifMatch }, async (tx) => {
    const count = await tx.room.count({ where: { exhibitionId: id } });
    if (count >= LIMITS.roomsPerExhibition) {
      throw conflict('room_limit', `Une exposition contient au plus ${LIMITS.roomsPerExhibition} salles.`);
    }
    const position = count + 1;
    await tx.room.create({ data: { exhibitionId: id, name: data.name ?? `Salle ${position}`, position, wallColor: DEFAULT_WALL_COLOR } });
    return { changed: true };
  });
}

// Placements et portes supprimés en cascade ; positions renumérotées.
export async function deleteRoom(userId, id, roomId, ifMatch) {
  return writeExhibition({ userId, exhibitionId: id, ifMatch }, async (tx) => {
    const rooms = await tx.room.findMany({ where: { exhibitionId: id }, orderBy: { position: 'asc' }, select: { id: true, position: true } });
    if (!rooms.some((r) => r.id === roomId)) throw notFound();
    if (rooms.length === 1) throw conflict('last_room', 'Une exposition garde au moins une salle.');
    await tx.room.delete({ where: { id: roomId } });
    const rest = rooms.filter((r) => r.id !== roomId);
    // Positions temporaires : index unique (exposition, position).
    for (const r of rest) await tx.room.update({ where: { id: r.id }, data: { position: r.position + 100 } });
    for (const [i, r] of rest.entries()) await tx.room.update({ where: { id: r.id }, data: { position: i + 1 } });
    return { changed: true };
  });
}

const placementsSchema = z.strictObject({
  placements: z
    .array(z.strictObject({ roomId: z.uuid('Salle inconnue.'), artworkId: z.uuid('Œuvre inconnue.'), slotCode: z.string().max(3) }))
    .max(LIMITS.artworksPerExhibition, `Au plus ${LIMITS.artworksPerExhibition} placements.`),
  // Facultatif : absent, les portes ne changent pas.
  doors: z
    .array(z.strictObject({ roomId: z.uuid('Salle inconnue.'), slotCode: z.string().max(3), targetRoomId: z.uuid('Salle inconnue.') }))
    .max(LIMITS.roomsPerExhibition * SLOT_CODES.length)
    .optional(),
});

const placementKey = (p) => `${p.roomId}|${p.artworkId}|${p.slotCode}`;
const doorKey = (d) => `${d.roomId}|${d.slotCode}|${d.targetRoomId}`;
const sameList = (a, b, key) => a.map(key).sort().join('\n') === b.map(key).sort().join('\n');

// Une place contient une œuvre ou une porte.
export async function replacePlacements(userId, id, ifMatch, body) {
  const { placements, doors } = parse(placementsSchema, body);
  return writeExhibition({ userId, exhibitionId: id, ifMatch }, async (tx) => {
    const rooms = await tx.room.findMany({ where: { exhibitionId: id }, select: { id: true } });
    const artworks = await tx.artwork.findMany({ where: { exhibitionId: id }, select: { id: true } });
    const currentDoors = await tx.door.findMany({ where: { room: { exhibitionId: id } } });
    const roomIds = new Set(rooms.map((r) => r.id));
    const artworkIds = new Set(artworks.map((a) => a.id));
    const finalDoors = doors ?? currentDoors.map(({ roomId, slotCode, targetRoomId }) => ({ roomId, slotCode, targetRoomId }));

    const fields = {};
    const usedSlots = new Set();
    finalDoors.forEach((d, i) => {
      const key = `doors.${i}`;
      if (!isSlotCode(d.slotCode)) fields[key] = `Place inconnue : ${d.slotCode}.`;
      else if (!roomIds.has(d.roomId) || !roomIds.has(d.targetRoomId)) fields[key] = 'Cette salle n’appartient pas à l’exposition.';
      else if (d.roomId === d.targetRoomId) fields[key] = 'Une porte mène à une autre salle.';
      else if (usedSlots.has(`${d.roomId}|${d.slotCode}`)) fields[key] = `La place ${d.slotCode} contient déjà une porte.`;
      usedSlots.add(`${d.roomId}|${d.slotCode}`);
    });
    const doorSlots = new Set(usedSlots);
    const usedArtworks = new Set();
    placements.forEach((p, i) => {
      const key = `placements.${i}`;
      if (!isSlotCode(p.slotCode)) fields[key] = `Place inconnue : ${p.slotCode}.`;
      else if (!roomIds.has(p.roomId)) fields[key] = 'Cette salle n’appartient pas à l’exposition.';
      else if (!artworkIds.has(p.artworkId)) fields[key] = 'Cette œuvre n’appartient pas à l’exposition.';
      else if (doorSlots.has(`${p.roomId}|${p.slotCode}`)) fields[key] = `La place ${p.slotCode} est occupée par une porte.`;
      else if (usedSlots.has(`${p.roomId}|${p.slotCode}`)) fields[key] = `La place ${p.slotCode} contient déjà une œuvre.`;
      else if (usedArtworks.has(p.artworkId)) fields[key] = 'Cette œuvre est déjà placée ailleurs.';
      usedSlots.add(`${p.roomId}|${p.slotCode}`);
      usedArtworks.add(p.artworkId);
    });
    if (Object.keys(fields).length > 0) {
      throw new AppError(422, 'placements_invalid', 'La disposition est invalide : rien n’a été enregistré.', fields);
    }

    const current = await tx.placement.findMany({ where: { room: { exhibitionId: id } } });
    const samePlacements = sameList(current, placements, placementKey);
    const sameDoors = sameList(currentDoors, finalDoors, doorKey);
    if (samePlacements && sameDoors) return { changed: false };

    if (!samePlacements) {
      await tx.placement.deleteMany({ where: { room: { exhibitionId: id } } });
      if (placements.length > 0) await tx.placement.createMany({ data: placements });
    }
    if (!sameDoors) {
      await tx.door.deleteMany({ where: { room: { exhibitionId: id } } });
      if (finalDoors.length > 0) await tx.door.createMany({ data: finalDoors });
    }
    return { changed: true };
  });
}

export async function publish(userId, id, ifMatch) {
  return writeExhibition({ userId, exhibitionId: id, ifMatch, requireDraft: false }, async (tx, ex) => {
    // Exposition masquée : publication impossible.
    if (ex.suspendedAt) {
      throw conflict('exhibition_suspended', 'Cette exposition a été masquée par l’équipe et ne peut pas être publiée.');
    }
    if (ex.status === EXHIBITION_STATUS.PUBLISHED) return { changed: false };
    const full = await tx.exhibition.findUnique({ where: { id }, include: STUDIO_INCLUDE });
    const problems = publicationProblems(studioExhibition(full));
    if (problems.length > 0) {
      const fields = Object.fromEntries(problems.map((p) => [p.key, p.message]));
      throw new AppError(422, 'publish_invalid', 'L’exposition n’est pas encore publiable.', fields);
    }
    await tx.exhibition.update({ where: { id }, data: { status: EXHIBITION_STATUS.PUBLISHED, publishedAt: new Date() } });
    return { changed: true };
  });
}

export async function unpublish(userId, id, ifMatch) {
  return writeExhibition({ userId, exhibitionId: id, ifMatch, requireDraft: false }, async (tx, ex) => {
    if (ex.status === EXHIBITION_STATUS.DRAFT) return { changed: false };
    await tx.exhibition.update({ where: { id }, data: { status: EXHIBITION_STATUS.DRAFT, publishedAt: null } });
    return { changed: true };
  });
}

export async function deleteExhibition(userId, id, ifMatch) {
  return writeExhibition({ userId, exhibitionId: id, ifMatch, requireDraft: false }, async (tx) => {
    const artworks = await tx.artwork.findMany({ where: { exhibitionId: id }, select: { imagePath: true, thumbnailPath: true } });
    // Couverture retirée d'abord (relation circulaire).
    await tx.exhibition.update({ where: { id }, data: { coverArtworkId: null } });
    await tx.exhibition.delete({ where: { id } });
    return { deleted: true, files: artworks.flatMap((a) => [a.imagePath, a.thumbnailPath]) };
  });
}
