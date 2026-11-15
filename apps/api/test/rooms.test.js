import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { anonymous, newUser, publish, readyExhibition } from './helpers.js';

const url = (id) => `/api/me/exhibitions/${id}`;

describe('plusieurs salles (L4)', () => {
  it('ajoute jusqu’à trois salles et refuse la quatrième côté serveur (T23)', async () => {
    const c = await newUser();
    let ex = await c.createExhibition();
    expect((await c.post(`${url(ex.id)}/rooms`, {})).status).toBe(428);

    let res = await c.post(`${url(ex.id)}/rooms`, {}, ex.etag);
    expect(res.status).toBe(201);
    ex = res.body.exhibition;
    expect(ex.rooms.map((r) => [r.position, r.name])).toEqual([
      [1, 'Salle 1'],
      [2, 'Salle 2'],
    ]);

    res = await c.post(`${url(ex.id)}/rooms`, { name: 'Jardin' }, ex.etag);
    ex = res.body.exhibition;
    expect(ex.rooms[2]).toMatchObject({ position: 3, name: 'Jardin', wallColor: 'white' });

    res = await c.post(`${url(ex.id)}/rooms`, {}, ex.etag);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('room_limit');
    expect(await prisma.room.count({ where: { exhibitionId: ex.id } })).toBe(3);
  });

  it('supprime une salle, ses placements, et renumérote les autres', async () => {
    const c = await newUser();
    let { exhibition: ex, artworkIds } = await readyExhibition(c, 2);
    for (let i = 0; i < 2; i++) ex = (await c.post(`${url(ex.id)}/rooms`, {}, ex.etag)).body.exhibition;
    const [r1, r2, r3] = ex.rooms;
    let res = await c.put(
      `${url(ex.id)}/placements`,
      { placements: [{ roomId: r1.id, artworkId: artworkIds[0], slotCode: 'N1' }, { roomId: r2.id, artworkId: artworkIds[1], slotCode: 'E2' }] },
      ex.etag,
    );
    ex = res.body.exhibition;

    res = await c.delete(`${url(ex.id)}/rooms/${r2.id}`, ex.etag);
    expect(res.status).toBe(200);
    ex = res.body.exhibition;
    expect(ex.rooms.map((r) => [r.id, r.position])).toEqual([
      [r1.id, 1],
      [r3.id, 2],
    ]);
    expect(ex.placements.map((p) => p.artworkId)).toEqual([artworkIds[0]]);
    expect(await prisma.artwork.count({ where: { exhibitionId: ex.id } })).toBe(2);
  });

  it('garde toujours au moins une salle', async () => {
    const c = await newUser();
    const ex = await c.createExhibition();
    const res = await c.delete(`${url(ex.id)}/rooms/${ex.rooms[0].id}`, ex.etag);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('last_room');
  });

  it('refuse les salles d’une autre personne et d’une exposition publiée', async () => {
    const owner = await newUser();
    const other = await newUser();
    let { exhibition: ex } = await readyExhibition(owner, 1);
    expect((await other.post(`${url(ex.id)}/rooms`, {}, ex.etag)).status).toBe(404);
    ex = (await owner.post(`${url(ex.id)}/rooms`, {}, ex.etag)).body.exhibition;
    expect((await other.delete(`${url(ex.id)}/rooms/${ex.rooms[1].id}`, ex.etag)).status).toBe(404);
    expect((await owner.delete(`${url(ex.id)}/rooms/${ex.rooms[1].id}`, ex.etag)).status).toBe(200);

    const published = await publish(owner, (await owner.get(url(ex.id))).body.exhibition);
    expect((await owner.post(`${url(ex.id)}/rooms`, {}, published.etag)).status).toBe(409);
  });

  it('une salle vide bloque la publication ; deux salles garnies se publient', async () => {
    const c = await newUser();
    let { exhibition: ex, artworkIds } = await readyExhibition(c, 2);
    ex = (await c.post(`${url(ex.id)}/rooms`, { name: 'Annexe' }, ex.etag)).body.exhibition;
    const annexe = ex.rooms[1];
    let res = await c.post(`${url(ex.id)}/publish`, undefined, ex.etag);
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.fields)).toContain(`room:${annexe.id}`);

    const moved = ex.placements.map((p) => (p.artworkId === artworkIds[1] ? { ...p, roomId: annexe.id, slotCode: 'N1' } : p));
    const doors = [{ roomId: ex.rooms[0].id, slotCode: 'S2', targetRoomId: annexe.id }];
    ex = (await c.put(`${url(ex.id)}/placements`, { placements: moved.map(({ roomId, artworkId, slotCode }) => ({ roomId, artworkId, slotCode })), doors }, ex.etag)).body
      .exhibition;
    await publish(c, ex);

    res = await (await anonymous()).get(`/api/exhibitions/${ex.id}`);
    expect(res.body.exhibition.rooms.map((r) => [r.name, r.placements.length])).toEqual([
      ['Salle 1', 1],
      ['Annexe', 1],
    ]);
  });
});

describe('portes entre salles', () => {
  async function threeRooms() {
    const c = await newUser();
    let { exhibition: ex, artworkIds } = await readyExhibition(c, 1);
    for (let i = 0; i < 2; i++) ex = (await c.post(`${url(ex.id)}/rooms`, {}, ex.etag)).body.exhibition;
    const placements = ex.placements.map(({ roomId, artworkId, slotCode }) => ({ roomId, artworkId, slotCode }));
    return { c, ex, artworkIds, rooms: ex.rooms.map((r) => r.id), placements };
  }

  it('aucune porte n’est posée automatiquement', async () => {
    const { ex } = await threeRooms();
    expect(ex.doors).toEqual([]);
  });

  it('une salle peut avoir plusieurs portes, vers n’importe quelle autre salle, même la même', async () => {
    const { c, ex, rooms: [r1, r2, r3], placements } = await threeRooms();
    const doors = [
      { roomId: r1, slotCode: 'N2', targetRoomId: r2 },
      { roomId: r1, slotCode: 'N3', targetRoomId: r2 },
      { roomId: r1, slotCode: 'W2', targetRoomId: r3 },
      { roomId: r3, slotCode: 'S2', targetRoomId: r1 },
    ];
    const res = await c.put(`${url(ex.id)}/placements`, { placements, doors }, ex.etag);
    expect(res.status).toBe(200);
    expect(res.body.exhibition.doors).toHaveLength(4);
    expect(res.body.exhibition.version).toBe(ex.version + 1);
    // Sans doors : portes inchangées.
    const again = await c.put(`${url(ex.id)}/placements`, { placements }, res.body.exhibition.etag);
    expect(again.body.exhibition.doors).toHaveLength(4);
    expect(again.body.exhibition.version).toBe(res.body.exhibition.version);
  });

  it('refuse les portes impossibles', async () => {
    const { c, ex, rooms: [r1, r2], placements } = await threeRooms();
    const other = await (await newUser()).createExhibition();
    for (const doors of [
      [{ roomId: r1, slotCode: 'N2', targetRoomId: r1 }],
      [{ roomId: r1, slotCode: 'N1', targetRoomId: r2 }],
      [{ roomId: r1, slotCode: 'X9', targetRoomId: r2 }],
      [{ roomId: r1, slotCode: 'n2', targetRoomId: r2 }],
      [{ roomId: r1, slotCode: 'N2', targetRoomId: other.rooms[0].id }],
      [
        { roomId: r1, slotCode: 'N2', targetRoomId: r2 },
        { roomId: r1, slotCode: 'N2', targetRoomId: r2 },
      ],
    ]) {
      const res = await c.put(`${url(ex.id)}/placements`, { placements, doors }, ex.etag);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('placements_invalid');
    }
  });

  it('supprimer une salle retire ses portes et celles qui y mènent', async () => {
    const { c, ex, rooms: [r1, r2, r3], placements } = await threeRooms();
    const doors = [
      { roomId: r1, slotCode: 'N2', targetRoomId: r2 },
      { roomId: r2, slotCode: 'N2', targetRoomId: r3 },
      { roomId: r3, slotCode: 'S2', targetRoomId: r1 },
    ];
    let res = await c.put(`${url(ex.id)}/placements`, { placements, doors }, ex.etag);
    res = await c.delete(`${url(ex.id)}/rooms/${r2}`, res.body.exhibition.etag);
    expect(res.body.exhibition.doors).toEqual([{ roomId: r3, slotCode: 'S2', targetRoomId: r1 }]);
  });

  it('chaque salle doit être accessible depuis la première ; la visite publique reçoit les portes', async () => {
    const c = await newUser();
    let { exhibition: ex, artworkIds } = await readyExhibition(c, 3);
    for (let i = 0; i < 2; i++) ex = (await c.post(`${url(ex.id)}/rooms`, {}, ex.etag)).body.exhibition;
    const [r1, r2, r3] = ex.rooms.map((r) => r.id);
    const placements = [r1, r2, r3].map((roomId, i) => ({ roomId, artworkId: artworkIds[i], slotCode: 'N1' }));
    // Salles 2 et 3 inaccessibles depuis la salle 1.
    let res = await c.put(`${url(ex.id)}/placements`, { placements, doors: [{ roomId: r2, slotCode: 'N2', targetRoomId: r3 }] }, ex.etag);
    ex = res.body.exhibition;
    res = await c.post(`${url(ex.id)}/publish`, undefined, ex.etag);
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining([`door:${r2}`, `door:${r3}`]));

    const doors = [
      { roomId: r1, slotCode: 'W2', targetRoomId: r2 },
      { roomId: r2, slotCode: 'N2', targetRoomId: r3 },
    ];
    ex = (await c.put(`${url(ex.id)}/placements`, { placements, doors }, ex.etag)).body.exhibition;
    await publish(c, ex);
    res = await (await anonymous()).get(`/api/exhibitions/${ex.id}`);
    expect(res.body.exhibition.rooms.map((r) => r.doors)).toEqual([[{ slotCode: 'W2', targetRoomId: r2 }], [{ slotCode: 'N2', targetRoomId: r3 }], []]);
  });
});

describe('recherche par titre (L4)', () => {
  it('ignore la casse et les accents, et traite % comme un caractère', async () => {
    const tag = randomBytes(4).toString('hex');
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 1);
    let res = await c.patch(url(exhibition.id), { title: `Été bleu ${tag}` }, exhibition.etag);
    await publish(c, res.body.exhibition);

    const visitor = await anonymous();
    res = await visitor.get(`/api/exhibitions?q=${encodeURIComponent(`ETE BLEU ${tag}`)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, q: `ETE BLEU ${tag}` });
    expect(res.body.items[0].id).toBe(exhibition.id);

    res = await visitor.get(`/api/exhibitions?q=${encodeURIComponent(`bleu%${tag}`)}`);
    expect(res.body.total).toBe(0);
    res = await visitor.get(`/api/exhibitions?q=${encodeURIComponent(`  ${tag}  `)}`);
    expect(res.body.total).toBe(1);
    expect((await visitor.get(`/api/exhibitions?q=${'x'.repeat(121)}`)).status).toBe(400);
  });
});
