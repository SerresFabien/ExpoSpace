import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { newUser } from './helpers.js';

async function setup(n = 3) {
  const c = await newUser();
  let ex = await c.createExhibition();
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await c.addArtwork(ex);
    ex = r.exhibition;
    ids.push(r.artworkId);
  }
  return { c, ex, ids, room: ex.rooms[0].id };
}

const put = (c, ex, placements) => c.put(`/api/me/exhibitions/${ex.id}/placements`, { placements }, ex.etag);

describe('placements', () => {
  it('conserve les mêmes œuvres aux mêmes places après rechargement (T08)', async () => {
    const { c, ex, ids, room } = await setup(3);
    const wanted = [
      { roomId: room, artworkId: ids[0], slotCode: 'N2' },
      { roomId: room, artworkId: ids[1], slotCode: 'E1' },
      { roomId: room, artworkId: ids[2], slotCode: 'W3' },
    ];
    const res = await put(c, ex, wanted);
    expect(res.status).toBe(200);
    expect(res.body.exhibition.version).toBe(ex.version + 1);
    const reloaded = (await c.get(`/api/me/exhibitions/${ex.id}`)).body.exhibition;
    expect(reloaded.placements).toEqual(wanted);
  });

  it('rejette tout le lot si une place ou une œuvre est en double (T09)', async () => {
    const { c, ex, ids, room } = await setup(2);
    const ok = (await put(c, ex, [{ roomId: room, artworkId: ids[0], slotCode: 'N1' }])).body.exhibition;

    const samePlace = await put(c, ok, [
      { roomId: room, artworkId: ids[0], slotCode: 'S1' },
      { roomId: room, artworkId: ids[1], slotCode: 'S1' },
    ]);
    expect(samePlace.status).toBe(422);
    expect(samePlace.body.code).toBe('placements_invalid');
    const twice = await put(c, ok, [
      { roomId: room, artworkId: ids[0], slotCode: 'S1' },
      { roomId: room, artworkId: ids[0], slotCode: 'S2' },
    ]);
    expect(twice.status).toBe(422);
    const after = (await c.get(`/api/me/exhibitions/${ex.id}`)).body.exhibition;
    expect(after.placements).toEqual([{ roomId: room, artworkId: ids[0], slotCode: 'N1' }]);
    expect(after.version).toBe(ok.version);
  });

  it('rejette une œuvre ou une salle d’une autre exposition (T10)', async () => {
    const { c, ex, ids, room } = await setup(1);
    const other = await c.addArtwork(await c.createExhibition());
    const foreignArt = await put(c, ex, [{ roomId: room, artworkId: other.artworkId, slotCode: 'N1' }]);
    expect(foreignArt.status).toBe(422);
    const foreignRoom = await put(c, ex, [{ roomId: other.exhibition.rooms[0].id, artworkId: ids[0], slotCode: 'N1' }]);
    expect(foreignRoom.status).toBe(422);
    const stranger = await newUser();
    const strangerArt = await stranger.addArtwork(await stranger.createExhibition());
    expect((await put(c, ex, [{ roomId: room, artworkId: strangerArt.artworkId, slotCode: 'N1' }])).status).toBe(422);
    expect(await prisma.placement.count({ where: { room: { exhibitionId: ex.id } } })).toBe(0);
  });

  it('refuse un code de place inconnu : impossible de placer un tableau à travers un mur', async () => {
    const { c, ex, ids, room } = await setup(1);
    for (const slotCode of ['N4', 'X1', 'n1', '']) {
      const res = await put(c, ex, [{ roomId: room, artworkId: ids[0], slotCode }]);
      expect(res.status).toBe(422);
    }
    const coords = await c.put(`/api/me/exhibitions/${ex.id}/placements`, { placements: [{ roomId: room, artworkId: ids[0], slotCode: 'N1', x: 99 }] }, ex.etag);
    expect(coords.status).toBe(400);
  });

  it('une liste vide libère toutes les places ; une sauvegarde identique ne change pas la version', async () => {
    const { c, ex, ids, room } = await setup(1);
    const placed = (await put(c, ex, [{ roomId: room, artworkId: ids[0], slotCode: 'S2' }])).body.exhibition;
    const same = await put(c, placed, [{ roomId: room, artworkId: ids[0], slotCode: 'S2' }]);
    expect(same.body.exhibition.version).toBe(placed.version);
    const empty = await put(c, placed, []);
    expect(empty.status).toBe(200);
    expect(empty.body.exhibition.placements).toEqual([]);
    expect(empty.body.exhibition.artworks).toHaveLength(1);
  });

  it('refuse plus de 36 entrées', async () => {
    const { c, ex, ids, room } = await setup(1);
    const many = Array.from({ length: 37 }, () => ({ roomId: room, artworkId: ids[0], slotCode: 'N1' }));
    expect((await put(c, ex, many)).status).toBe(400);
  });
});
