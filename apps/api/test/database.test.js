import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { SESSION_MAX_MS, closeSessionStore } from '../src/middleware/session.js';
import { PrismaSessionStore } from '../src/middleware/sessionStore.js';
import { newUser, publish, readyExhibition } from './helpers.js';

const close = (date, expected, toleranceMs) => expect(Math.abs(new Date(date).getTime() - expected)).toBeLessThan(toleranceMs);

describe('dates', () => {
  it('les dates écrites par MariaDB et par Prisma sont en UTC, cohérentes avec l’horloge de Node', async () => {
    const [{ zone }] = await prisma.$queryRaw`SELECT @@session.time_zone AS zone`;
    expect(zone).toBe('+00:00');
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 1);
    close(exhibition.createdAt, Date.now(), 60_000);
    const pub = await publish(c, exhibition);
    close(pub.publishedAt, Date.now(), 60_000);
    const [{ diff }] = await prisma.$queryRaw`SELECT TIMESTAMPDIFF(SECOND, createdAt, UTC_TIMESTAMP(3)) AS diff FROM \`Exhibition\` WHERE id = ${pub.id}`;
    expect(Math.abs(Number(diff))).toBeLessThan(60);
  });
});

describe('sessions en base', () => {
  it('enregistre la session à la connexion, sans secret, pour 7 jours au plus', async () => {
    const before = await prisma.session.count();
    const c = await newUser();
    const rows = await prisma.session.findMany({ orderBy: { expiresAt: 'desc' }, take: 5 });
    expect(await prisma.session.count()).toBeGreaterThan(before);
    const mine = rows.find((r) => JSON.parse(r.sessionData).userId === c.user.id);
    expect(mine).toBeDefined();
    expect(mine.sessionData).not.toMatch(/argon|password/i);
    close(mine.expiresAt, Date.now() + SESSION_MAX_MS, 120_000);
  });

  it('ignore et supprime les sessions expirées', async () => {
    const store = new PrismaSessionStore({ prisma, defaultMaxAgeMs: 1000, pruneIntervalMs: 0 });
    const sid = `test-expiree-${Date.now()}`;
    await prisma.session.create({ data: { sid, sessionData: JSON.stringify({ userId: 'x' }), expiresAt: new Date(Date.now() - 1000) } });
    const read = await new Promise((ok, ko) => store.get(sid, (err, s) => (err ? ko(err) : ok(s))));
    expect(read).toBeNull();
    expect(await store.prune()).toBeGreaterThanOrEqual(1);
    expect(await prisma.session.count({ where: { sid } })).toBe(0);
    await closeSessionStore();
  });
});

describe('contraintes CHECK', () => {
  it('refusent un identifiant en majuscules et un code de place inconnu, même en écriture directe', async () => {
    await expect(prisma.user.create({ data: { usernameKey: 'Majuscules', displayName: 'X', passwordHash: 'h', recoveryCodeHash: 'h' } })).rejects.toThrow();
    const c = await newUser();
    const { exhibition, artworkIds } = await readyExhibition(c, 1);
    await expect(prisma.placement.update({ where: { artworkId: artworkIds[0] }, data: { slotCode: 'n1' } })).rejects.toThrow();
    await expect(prisma.placement.update({ where: { artworkId: artworkIds[0] }, data: { slotCode: 'X9' } })).rejects.toThrow();
    expect((await prisma.placement.findUnique({ where: { artworkId: artworkIds[0] } })).slotCode).toBe('N1');
    expect(exhibition.status).toBe('DRAFT');
  });
});
