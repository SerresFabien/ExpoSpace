import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { absoluteUploadPath } from '../src/services/images.js';
import { anonymous, newUser } from './helpers.js';

const url = (id) => `/api/me/exhibitions/${id}`;

describe('création et lecture', () => {
  it('crée un brouillon avec une première salle et un ETag', async () => {
    const c = await newUser();
    const res = await c.post('/api/me/exhibitions', { title: '  Lumières urbaines ', description: 'Photos de nuit.' });
    expect(res.status).toBe(201);
    const ex = res.body.exhibition;
    expect(ex).toMatchObject({ title: 'Lumières urbaines', status: 'DRAFT', version: 1, coverArtworkId: null });
    expect(ex.rooms).toEqual([expect.objectContaining({ name: 'Salle 1', position: 1, wallColor: 'white' })]);
    expect(res.headers.etag).toBe(`"exhibition-${ex.id}-v1"`);
    const get = await c.get(url(ex.id));
    expect(get.status).toBe(200);
    expect(get.headers.etag).toBe(ex.etag);
    const list = await c.get('/api/me/exhibitions');
    expect(list.body.exhibitions.map((e) => e.id)).toContain(ex.id);
  });

  it('enregistre réellement en base (T04 : la donnée ne dépend pas du processus)', async () => {
    const c = await newUser();
    const ex = await c.createExhibition('Persistante');
    const row = await prisma.exhibition.findUnique({ where: { id: ex.id }, include: { rooms: true } });
    expect(row.title).toBe('Persistante');
    expect(row.ownerId).toBe(c.user.id);
    expect(row.rooms).toHaveLength(1);
  });

  it('refuse un titre vide ou trop long et les champs inconnus', async () => {
    const c = await newUser();
    expect((await c.post('/api/me/exhibitions', { title: '   ' })).status).toBe(400);
    expect((await c.post('/api/me/exhibitions', { title: 'x'.repeat(121) })).status).toBe(400);
    expect((await c.post('/api/me/exhibitions', { title: 'Ok', status: 'PUBLISHED' })).status).toBe(400);
  });

  it('exige une session', async () => {
    const a = await anonymous();
    expect((await a.get('/api/me/exhibitions')).status).toBe(401);
    expect((await a.post('/api/me/exhibitions', { title: 'X' })).status).toBe(401);
  });
});

describe('isolation entre créateurs (T05)', () => {
  it('B ne peut ni lire ni modifier ni supprimer l’exposition de A', async () => {
    const a = await newUser();
    const b = await newUser();
    const ex = await a.createExhibition('Brouillon secret de A');

    const read = await b.get(url(ex.id));
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('secret');
    expect((await b.patch(url(ex.id), { title: 'Piraté' }, ex.etag)).status).toBe(404);
    expect((await b.put(`${url(ex.id)}/placements`, { placements: [] }, ex.etag)).status).toBe(404);
    expect((await b.post(`${url(ex.id)}/publish`, undefined, ex.etag)).status).toBe(404);
    expect((await b.delete(url(ex.id), ex.etag)).status).toBe(404);
    expect((await b.get('/api/me/exhibitions')).body.exhibitions).toEqual([]);

    const row = await prisma.exhibition.findUnique({ where: { id: ex.id } });
    expect(row.title).toBe('Brouillon secret de A');
    expect(row.version).toBe(1);
    expect((await (await anonymous()).get(`/api/exhibitions/${ex.id}`)).status).toBe(404);
  });

  it('un identifiant mal formé répond 404', async () => {
    const c = await newUser();
    expect((await c.get(url('pas-un-uuid'))).status).toBe(404);
  });
});

describe('version et If-Match (T11)', () => {
  it('428 sans If-Match, 412 avec une version dépassée, sans réessai', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const missing = await c.patch(url(ex.id), { title: 'Sans précondition' });
    expect(missing.status).toBe(428);
    expect(missing.body.code).toBe('precondition_required');

    const tab1 = ex.etag;
    const tab2 = ex.etag;
    const first = await c.patch(url(ex.id), { title: 'Onglet 1' }, tab1);
    expect(first.status).toBe(200);
    expect(first.body.exhibition.version).toBe(2);
    expect(first.headers.etag).toBe(`"exhibition-${ex.id}-v2"`);
    const second = await c.patch(url(ex.id), { title: 'Onglet 2' }, tab2);
    expect(second.status).toBe(412);
    expect(second.body.code).toBe('version_conflict');
    expect((await c.get(url(ex.id))).body.exhibition.title).toBe('Onglet 1');
    const other = await c.createExhibition();
    expect((await c.patch(url(ex.id), { title: 'X' }, other.etag)).status).toBe(412);
  });

  it('une sauvegarde identique n’incrémente pas la version', async () => {
    const c = await newUser();
    const ex = await c.createExhibition('Même titre');
    const res = await c.patch(url(ex.id), { title: 'Même titre', description: ex.description }, ex.etag);
    expect(res.status).toBe(200);
    expect(res.body.exhibition.version).toBe(1);
  });

  it('la couverture doit appartenir à l’exposition', async () => {
    const c = await newUser();
    const ex1 = await c.createExhibition();
    const { artworkId } = await c.addArtwork(await c.createExhibition());
    const res = await c.patch(url(ex1.id), { coverArtworkId: artworkId }, ex1.etag);
    expect(res.status).toBe(400);
    expect(res.body.fields.coverArtworkId).toBeDefined();
  });
});

describe('salle', () => {
  it('renomme la salle et change la couleur des murs', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const room = ex.rooms[0];
    const res = await c.patch(`${url(ex.id)}/rooms/${room.id}`, { name: 'Entrée', wallColor: 'sage' }, ex.etag);
    expect(res.status).toBe(200);
    expect(res.body.exhibition.rooms[0]).toMatchObject({ name: 'Entrée', wallColor: 'sage' });
    expect((await c.patch(`${url(ex.id)}/rooms/${room.id}`, { wallColor: 'fuchsia' }, res.body.exhibition.etag)).status).toBe(400);
  });
});

describe('quota (T23)', () => {
  it('refuse la 11e exposition côté serveur', async () => {
    const c = await newUser();
    for (let i = 0; i < 10; i++) await c.createExhibition(`Expo ${i}`);
    const res = await c.post('/api/me/exhibitions', { title: 'Une de trop' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('quota_exceeded');
    expect(await prisma.exhibition.count({ where: { ownerId: c.user.id } })).toBe(10);
  });
});

describe('suppression (§6.3)', () => {
  it('supprime salles, œuvres, placements et fichiers', async () => {
    const c = await newUser();
    let ex = await c.createExhibition();
    const r = await c.addArtwork(ex);
    ex = r.exhibition;
    const placed = await c.put(`${url(ex.id)}/placements`, { placements: [{ roomId: ex.rooms[0].id, artworkId: r.artworkId, slotCode: 'N2' }] }, ex.etag);
    ex = placed.body.exhibition;
    const cover = await c.patch(url(ex.id), { coverArtworkId: r.artworkId }, ex.etag);
    ex = cover.body.exhibition;
    const files = await prisma.artwork.findUnique({ where: { id: r.artworkId } });
    expect(existsSync(absoluteUploadPath(files.imagePath))).toBe(true);

    expect((await c.delete(url(ex.id))).status).toBe(428);
    expect((await c.delete(url(ex.id), ex.etag)).status).toBe(204);
    expect((await c.get(url(ex.id))).status).toBe(404);
    expect(await prisma.artwork.count({ where: { exhibitionId: ex.id } })).toBe(0);
    expect(await prisma.room.count({ where: { exhibitionId: ex.id } })).toBe(0);
    expect(existsSync(absoluteUploadPath(files.imagePath))).toBe(false);
    expect(existsSync(absoluteUploadPath(files.thumbnailPath))).toBe(false);
  });
});
