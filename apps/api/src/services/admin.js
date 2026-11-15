// Suspension des comptes et des expositions.
import { prisma } from '../db/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { parse, z } from '../lib/validate.js';

const listSchema = z.object({ q: z.string().trim().max(60).default(''), page: z.coerce.number().int().min(1).max(10_000).default(1) });
const PAGE = 20;

export async function listUsers(query) {
  const { q, page } = parse(listSchema, query);
  const where = q ? { OR: [{ usernameKey: { contains: q.toLowerCase() } }, { displayName: { contains: q } }] } : {};
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * PAGE,
    take: PAGE,
    select: { id: true, usernameKey: true, displayName: true, role: true, suspendedAt: true, createdAt: true, _count: { select: { exhibitions: true } } },
  });
  return rows.map((u) => ({
    id: u.id,
    username: u.usernameKey,
    displayName: u.displayName,
    role: u.role,
    suspended: Boolean(u.suspendedAt),
    exhibitionCount: u._count.exhibitions,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function listExhibitions(query) {
  const { q, page } = parse(listSchema, query);
  const rows = await prisma.exhibition.findMany({
    where: {
      OR: [{ status: 'PUBLISHED' }, { suspendedAt: { not: null } }],
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * PAGE,
    take: PAGE,
    select: { id: true, title: true, status: true, suspendedAt: true, publishedAt: true, owner: { select: { usernameKey: true, displayName: true, suspendedAt: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    suspended: Boolean(e.suspendedAt),
    publishedAt: e.publishedAt?.toISOString() ?? null,
    owner: { username: e.owner.usernameKey, displayName: e.owner.displayName, suspended: Boolean(e.owner.suspendedAt) },
  }));
}

export async function setExhibitionSuspended(id, suspended) {
  const ex = await prisma.exhibition.findUnique({ where: { id }, select: { id: true } });
  if (!ex) throw notFound();
  const updated = await prisma.exhibition.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null }, select: { id: true, suspendedAt: true } });
  return { id: updated.id, suspended: Boolean(updated.suspendedAt) };
}

export async function setUserSuspended(admin, id, suspended) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw notFound();
  if (user.id === admin.id) throw badRequest('self_suspension', 'Vous ne pouvez pas suspendre votre propre compte.');
  if (user.role === 'ADMIN') throw forbidden('admin_target', 'Un administrateur ne peut pas être suspendu depuis l’interface.');
  const updated = await prisma.user.update({
    where: { id },
    data: suspended ? { suspendedAt: new Date(), sessionVersion: { increment: 1 } } : { suspendedAt: null },
    select: { id: true, suspendedAt: true },
  });
  return { id: updated.id, suspended: Boolean(updated.suspendedAt) };
}
