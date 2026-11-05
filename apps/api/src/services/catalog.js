// Lecture publique des expositions publiées.
import { LIMITS } from '@expospace/shared/limits.js';
import { prisma } from '../db/prisma.js';
import { notFound } from '../lib/errors.js';
import { parse, z } from '../lib/validate.js';
import { visitorsIn } from './presence.js';
import { catalogCard, publicExhibition } from './presenters.js';

export const PUBLIC_WHERE = Object.freeze({ status: 'PUBLISHED', suspendedAt: null, owner: { suspendedAt: null } });

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  q: z.string().trim().max(LIMITS.exhibitionTitleMax).default(''),
});

// Insensible à la casse et aux accents (collation).
export async function listPublished(query) {
  const { page, q } = parse(pageSchema, { page: query.page, q: typeof query.q === 'string' ? query.q : undefined });
  const size = LIMITS.catalogPageSize;
  // Prisma n'échappe pas les jokers LIKE.
  const where = q ? { ...PUBLIC_WHERE, title: { contains: q.replace(/[\\%_]/g, '\\$&') } } : PUBLIC_WHERE;
  const [total, rows] = await Promise.all([
    prisma.exhibition.count({ where }),
    prisma.exhibition.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        owner: { select: { displayName: true } },
        coverArtwork: { select: { id: true, altText: true } },
        rooms: { select: { _count: { select: { placements: true } } } },
      },
    }),
  ]);
  return { items: rows.map((row) => ({ ...catalogCard(row), visitors: visitorsIn(row.id) })), page, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total / size)), q };
}

export async function getPublished(id) {
  const ex = await prisma.exhibition.findFirst({
    where: { id, ...PUBLIC_WHERE },
    include: {
      owner: { select: { displayName: true } },
      coverArtwork: { select: { id: true, altText: true } },
      rooms: { include: { placements: { include: { artwork: true } }, doors: true } },
    },
  });
  if (!ex) throw notFound('Exposition introuvable ou indisponible.');
  return publicExhibition(ex);
}

// Propriétaire : toutes ses œuvres. Public : œuvres placées d'une exposition publiée.
export async function readableImage(artworkId, variant, viewer) {
  const art = await prisma.artwork.findUnique({
    where: { id: artworkId },
    select: {
      imagePath: true,
      thumbnailPath: true,
      placement: { select: { id: true } },
      exhibition: { select: { ownerId: true, status: true, suspendedAt: true, owner: { select: { suspendedAt: true } } } },
    },
  });
  if (!art) return null;
  const ex = art.exhibition;
  const isOwner = viewer?.id === ex.ownerId;
  const isPublic = Boolean(art.placement) && ex.status === 'PUBLISHED' && !ex.suspendedAt && !ex.owner.suspendedAt;
  if (!isOwner && !isPublic) return null;
  return variant === 'thumb' ? art.thumbnailPath : art.imagePath;
}
