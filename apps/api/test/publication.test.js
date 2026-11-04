import { describe, expect, it } from 'vitest';
import { anonymous, jpeg, newUser, publish, readyExhibition } from './helpers.js';

describe('conditions de publication (T12)', () => {
  it('refuse une exposition vide avec une explication exploitable', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const res = await c.post(`/api/me/exhibitions/${ex.id}/publish`, undefined, ex.etag);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('publish_invalid');
    expect(res.body.fields.cover).toBeDefined();
    expect(res.body.fields[`room:${ex.rooms[0].id}`]).toMatch(/au moins une œuvre/);
  });

  it('refuse une œuvre placée sans texte alternatif et une couverture non placée', async () => {
    const c = await newUser();
    let ex = await c.createExhibition();
    const a = await c.addArtwork(ex, { fields: { title: 'Sans alt' } });
    ex = a.exhibition;
    const b = await c.addArtwork(ex, { fields: { title: 'Pas placée', altText: 'ok' } });
    ex = b.exhibition;
    ex = (await c.put(`/api/me/exhibitions/${ex.id}/placements`, { placements: [{ roomId: ex.rooms[0].id, artworkId: a.artworkId, slotCode: 'N1' }] }, ex.etag)).body.exhibition;
    ex = (await c.patch(`/api/me/exhibitions/${ex.id}`, { coverArtworkId: b.artworkId }, ex.etag)).body.exhibition;
    const res = await c.post(`/api/me/exhibitions/${ex.id}/publish`, undefined, ex.etag);
    expect(res.status).toBe(422);
    expect(res.body.fields[`artwork:${a.artworkId}`]).toBeDefined();
    expect(res.body.fields.cover).toMatch(/placée/);
  });
});

describe('publication et visite sans compte (T13)', () => {
  it('publie trois œuvres : catalogue, fiche et images accessibles', async () => {
    const c = await newUser();
    const { exhibition, artworkIds } = await readyExhibition(c, 3);
    const published = await publish(c, exhibition);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeTruthy();

    const visitor = await anonymous();
    const catalog = await visitor.get('/api/exhibitions');
    expect(catalog.status).toBe(200);
    const card = catalog.body.items.find((i) => i.id === exhibition.id);
    expect(card).toMatchObject({ title: exhibition.title, creator: 'Testeur', artworkCount: 3 });
    expect(card.cover.url).toContain(artworkIds[0]);

    const sheet = await visitor.get(`/api/exhibitions/${exhibition.id}`);
    expect(sheet.status).toBe(200);
    expect(sheet.body.exhibition.rooms[0].placements.map((p) => p.slotCode)).toEqual(['N1', 'N2', 'N3']);
    expect(JSON.stringify(sheet.body)).not.toMatch(/ownerId|imagePath|passwordHash|version/);

    for (const id of artworkIds) {
      const img = await visitor.get(`/api/artworks/${id}/image`);
      expect(img.status).toBe(200);
      expect(img.headers['cache-control']).toBe('private, no-store');
    }
    expect((await visitor.get(card.cover.url)).status).toBe(200);
  });

  it('pagine le catalogue par 12, plus récentes d’abord', async () => {
    const visitor = await anonymous();
    const page = await visitor.get('/api/exhibitions?page=1');
    expect(page.body.pageSize).toBe(12);
    expect(page.body.items.length).toBeLessThanOrEqual(12);
    const dates = page.body.items.map((i) => i.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect((await visitor.get('/api/exhibitions?page=0')).status).toBe(400);
  });
});

describe('confidentialité des œuvres (T15)', () => {
  it('une œuvre importée mais non placée d’une publication reste privée', async () => {
    const c = await newUser();
    const ready = await readyExhibition(c, 1);
    const extra = await c.addArtwork(ready.exhibition, { fields: { title: 'Réserve', altText: 'non exposée' } });
    await publish(c, extra.exhibition);
    const visitor = await anonymous();
    expect((await visitor.get(`/api/artworks/${extra.artworkId}/image`)).status).toBe(404);
    expect((await visitor.get(`/api/artworks/${ready.artworkIds[0]}/image`)).status).toBe(200);
    const sheet = await visitor.get(`/api/exhibitions/${ready.exhibition.id}`);
    expect(JSON.stringify(sheet.body)).not.toContain(extra.artworkId);
  });
});

describe('verrouillage d’une exposition publiée (T16)', () => {
  it('refuse toute modification de contenu avec 409', async () => {
    const c = await newUser();
    const { exhibition, artworkIds } = await readyExhibition(c, 1);
    const pub = await publish(c, exhibition);
    const base = `/api/me/exhibitions/${pub.id}`;
    const attempts = [
      await c.patch(base, { title: 'Nouveau titre' }, pub.etag),
      await c.put(`${base}/placements`, { placements: [] }, pub.etag),
      await c.patch(`${base}/artworks/${artworkIds[0]}`, { title: 'X' }, pub.etag),
      await c.delete(`${base}/artworks/${artworkIds[0]}`, pub.etag),
      await c.patch(`${base}/rooms/${pub.rooms[0].id}`, { name: 'X' }, pub.etag),
      await c.upload(pub.id, pub.etag, await jpeg()),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('exhibition_published');
    }
    expect((await c.get(base)).body.exhibition.version).toBe(pub.version);
  });
});

describe('dépublication (T17)', () => {
  it('bloque les nouvelles consultations, puis le même lien refonctionne après republication', async () => {
    const c = await newUser();
    const { exhibition, artworkIds } = await readyExhibition(c, 2);
    const pub = await publish(c, exhibition);
    const res = await c.post(`/api/me/exhibitions/${pub.id}/unpublish`, undefined, pub.etag);
    expect(res.status).toBe(200);
    const draft = res.body.exhibition;
    expect(draft.status).toBe('DRAFT');

    const visitor = await anonymous();
    const sheet = await visitor.get(`/api/exhibitions/${pub.id}`);
    expect(sheet.status).toBe(404);
    expect(JSON.stringify(sheet.body)).not.toContain(pub.title);
    expect((await visitor.get(`/api/artworks/${artworkIds[0]}/image`)).status).toBe(404);
    expect((await visitor.get('/api/exhibitions')).body.items.map((i) => i.id)).not.toContain(pub.id);
    expect((await c.get(`/api/artworks/${artworkIds[0]}/image`)).status).toBe(200);

    const edited = (await c.patch(`/api/me/exhibitions/${pub.id}`, { title: 'Titre corrigé' }, draft.etag)).body.exhibition;
    const again = await publish(c, edited);
    expect(again.id).toBe(pub.id);
    expect((await visitor.get(`/api/exhibitions/${pub.id}`)).body.exhibition.title).toBe('Titre corrigé');
  });

  it('publier deux fois ou dépublier un brouillon ne change rien', async () => {
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 1);
    const draftAgain = await c.post(`/api/me/exhibitions/${exhibition.id}/unpublish`, undefined, exhibition.etag);
    expect(draftAgain.body.exhibition.version).toBe(exhibition.version);
    const pub = await publish(c, exhibition);
    const twice = await c.post(`/api/me/exhibitions/${pub.id}/publish`, undefined, pub.etag);
    expect(twice.body.exhibition.version).toBe(pub.version);
  });

  it('supprimer une exposition publiée la retire du catalogue', async () => {
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 1);
    const pub = await publish(c, exhibition);
    expect((await c.delete(`/api/me/exhibitions/${pub.id}`, pub.etag)).status).toBe(204);
    expect((await (await anonymous()).get(`/api/exhibitions/${pub.id}`)).status).toBe(404);
  });
});
