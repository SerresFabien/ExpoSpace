import { readdirSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { prisma } from '../src/db/prisma.js';
import { anonymous, jpeg, newUser, png } from './helpers.js';

const uploadedFiles = () => readdirSync(config.uploadDir).length;
const tmpFiles = () => readdirSync(config.tmpDir).length;

describe('import d’une image valide (T06)', () => {
  it('crée la fiche et les deux variantes, lisibles par le propriétaire', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const res = await c.upload(ex.id, ex.etag, await jpeg(3000, 2000), { fields: { title: 'Reflets', altText: 'Reflets de néons sur le trottoir' } });
    expect(res.status).toBe(201);
    const art = res.body.exhibition.artworks.find((a) => a.id === res.body.artworkId);
    expect(art).toMatchObject({ title: 'Reflets', widthPx: 2048, heightPx: 1365 });
    expect(art.byteSize).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(res.body.exhibition.version).toBe(2);
    expect(JSON.stringify(res.body)).not.toMatch(/imagePath|thumbnailPath|\.webp/);

    const full = await c.get(art.imageUrl).buffer(true);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('image/webp');
    expect(full.headers['cache-control']).toBe('private, no-store');
    const thumb = await c.get(art.thumbnailUrl).buffer(true);
    const meta = await sharp(thumb.body).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(480);
    expect(tmpFiles()).toBe(0);
  });

  it('n’agrandit pas une petite image et respecte un portrait', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const r = await c.addArtwork(ex, { width: 300, height: 500 });
    const art = r.exhibition.artworks[0];
    expect(art).toMatchObject({ widthPx: 300, heightPx: 500 });
  });

  it('applique l’orientation EXIF', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#336699' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const res = await c.upload(ex.id, ex.etag, rotated, { fields: { title: 'Rotation' } });
    expect(res.status).toBe(201);
    expect(res.body.exhibition.artworks[0]).toMatchObject({ widthPx: 200, heightPx: 400 });
  });
});

describe('imports refusés (T07)', () => {
  it('refuse un faux JPEG, un fichier trop gros, trop de pixels, sans rien laisser', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const before = uploadedFiles();

    const fake = await c.upload(ex.id, ex.etag, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), { filename: 'faux.jpg' });
    expect(fake.status).toBe(415);
    expect(fake.body.code).toBe('unsupported_format');

    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    const tooBig = await c.upload(ex.id, ex.etag, big);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.code).toBe('file_too_large');

    const huge = await c.upload(ex.id, ex.etag, await png(5000, 4100), { filename: 'enorme.png' });
    expect(huge.status).toBe(422);
    expect(huge.body.code).toBe('too_many_pixels');

    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('pas une vraie image jpeg')]);
    expect((await c.upload(ex.id, ex.etag, corrupt)).status).toBe(422);

    expect(await prisma.artwork.count({ where: { exhibitionId: ex.id } })).toBe(0);
    expect(uploadedFiles()).toBe(before);
    expect(tmpFiles()).toBe(0);
    expect((await c.get(`/api/me/exhibitions/${ex.id}`)).body.exhibition.version).toBe(1);
  });

  it('exige la déclaration de droits et le If-Match', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const noRights = await c.upload(ex.id, ex.etag, await jpeg(), { rights: false });
    expect(noRights.status).toBe(400);
    expect(noRights.body.fields.rightsConfirmed).toBeDefined();
    expect((await c.upload(ex.id, undefined, await jpeg())).status).toBe(428);
    expect((await c.upload(ex.id, `"exhibition-${ex.id}-v99"`, await jpeg())).status).toBe(412);
  });

  it('refuse l’import dans l’exposition d’un autre', async () => {
    const a = await newUser();
    const b = await newUser();
    const ex = await a.createExhibition();
    expect((await b.upload(ex.id, ex.etag, await jpeg())).status).toBe(404);
  });
});

describe('accès aux images (T14)', () => {
  it('l’image d’un brouillon est refusée sans connexion et aux autres comptes', async () => {
    const c = await newUser();
    const r = await c.addArtwork(await c.createExhibition());
    const art = r.exhibition.artworks[0];
    expect((await (await anonymous()).get(art.imageUrl)).status).toBe(404);
    expect((await (await newUser()).get(art.thumbnailUrl)).status).toBe(404);
    expect((await c.get(art.imageUrl)).status).toBe(200);
  });
});

describe('fiches d’œuvre', () => {
  it('modifie la fiche, refuse une œuvre d’une autre exposition', async () => {
    const c = await newUser();
    const r = await c.addArtwork(await c.createExhibition());
    const ex = r.exhibition;
    const res = await c.patch(`/api/me/exhibitions/${ex.id}/artworks/${r.artworkId}`, { title: 'Nuit', artistName: 'Camille', description: 'Ligne 1\nLigne 2', altText: 'Rue de nuit' }, ex.etag);
    expect(res.status).toBe(200);
    expect(res.body.exhibition.artworks[0]).toMatchObject({ title: 'Nuit', artistName: 'Camille', description: 'Ligne 1\nLigne 2' });
    const other = await c.createExhibition();
    expect((await c.patch(`/api/me/exhibitions/${other.id}/artworks/${r.artworkId}`, { title: 'X' }, other.etag)).status).toBe(404);
    expect((await c.patch(`/api/me/exhibitions/${ex.id}/artworks/${r.artworkId}`, { exhibitionId: other.id }, res.body.exhibition.etag)).status).toBe(400);
  });

  it('supprimer une œuvre placée et choisie en couverture libère la place et la couverture (T24)', async () => {
    const c = await newUser();
    let ex = await c.createExhibition();
    const r = await c.addArtwork(ex);
    ex = r.exhibition;
    ex = (await c.put(`/api/me/exhibitions/${ex.id}/placements`, { placements: [{ roomId: ex.rooms[0].id, artworkId: r.artworkId, slotCode: 'E2' }] }, ex.etag)).body.exhibition;
    ex = (await c.patch(`/api/me/exhibitions/${ex.id}`, { coverArtworkId: r.artworkId }, ex.etag)).body.exhibition;
    const res = await c.delete(`/api/me/exhibitions/${ex.id}/artworks/${r.artworkId}`, ex.etag);
    expect(res.status).toBe(200);
    expect(res.body.exhibition).toMatchObject({ coverArtworkId: null, placements: [], artworks: [] });
    expect((await c.get(`/api/artworks/${r.artworkId}/image`)).status).toBe(404);
  });
});

describe('quotas d’œuvres (T23)', () => {
  it('refuse la 37e œuvre d’une exposition', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    await prisma.artwork.createMany({
      data: Array.from({ length: 36 }, (_, i) => ({ exhibitionId: ex.id, imagePath: `quota-${ex.id}-${i}.webp`, thumbnailPath: `quota-${ex.id}-${i}-t.webp`, widthPx: 10, heightPx: 10, byteSize: 100 })),
    });
    const res = await c.upload(ex.id, ex.etag, await jpeg());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('quota_exceeded');
  });

  it('refuse un import qui dépasserait 250 Mio par compte', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const other = await c.createExhibition();
    await prisma.artwork.create({ data: { exhibitionId: other.id, imagePath: `big-${other.id}.webp`, thumbnailPath: `big-${other.id}-t.webp`, widthPx: 10, heightPx: 10, byteSize: 250 * 1024 * 1024 } });
    const res = await c.upload(ex.id, ex.etag, await jpeg());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('quota_exceeded');
  });
});
