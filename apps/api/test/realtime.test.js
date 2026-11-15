import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { prisma } from '../src/db/prisma.js';
import { setRateLimiting } from '../src/middleware/rateLimit.js';
import { CHAT_MAX, REALTIME_PATH, createRealtimeApp } from '../src/realtime.js';
import { newUser, publish, readyExhibition } from './helpers.js';

const ORIGIN = 'http://localhost:5173';
let app;
let base;
const sockets = [];

beforeAll(async () => {
  app = createRealtimeApp();
  await new Promise((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.httpServer.address().port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((resolve) => app.io.close(resolve));
});

function open({ cookie, origin = ORIGIN, fetchSite, transport = 'websocket' } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (fetchSite) headers['sec-fetch-site'] = fetchSite;
  const socket = connect(base, { path: REALTIME_PATH, transports: [transport], extraHeaders: headers, forceNew: true, reconnection: false });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

// Appel d'une méthode express-x.
async function call(socket, name, action, ...args) {
  const { error, result } = await socket.timeout(5000).emitWithAck('client-request', { name, action, args });
  if (error) throw error;
  return result;
}

function next(socket, event, filter = () => true) {
  return new Promise((resolve) => {
    const handler = (payload) => {
      if (!filter(payload)) return;
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

const presenceIs = (count) => (e) => e.type === 'presence' && e.value.count === count;

async function account() {
  const client = await newUser();
  const res = await client.login(client.user.username, client.password);
  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('expospace_sid=')).split(';')[0];
  return { client, cookie };
}

async function publishedRooms() {
  const owner = await newUser();
  let { exhibition } = await readyExhibition(owner, 1);
  const title = `Salles ${randomBytes(5).toString('hex')}`;
  exhibition = (await owner.patch(`/api/me/exhibitions/${exhibition.id}`, { title }, exhibition.etag)).body.exhibition;
  exhibition = (await owner.post(`/api/me/exhibitions/${exhibition.id}/rooms`, {}, exhibition.etag)).body.exhibition;
  const moved = exhibition.placements.map(({ artworkId }) => ({ roomId: exhibition.rooms[0].id, artworkId, slotCode: 'N1' }));
  const extra = await owner.addArtwork(exhibition);
  exhibition = extra.exhibition;
  moved.push({ roomId: exhibition.rooms[1].id, artworkId: extra.artworkId, slotCode: 'N1' });
  const [r1, r2] = exhibition.rooms.map((r) => r.id);
  const doors = [{ roomId: r1, slotCode: 'N2', targetRoomId: r2 }];
  exhibition = (await owner.put(`/api/me/exhibitions/${exhibition.id}/placements`, { placements: moved, doors }, exhibition.etag)).body.exhibition;
  exhibition = await publish(owner, exhibition);
  return { owner, exhibition, title, rooms: exhibition.rooms.map((r) => r.id) };
}

describe('connexion temps réel', () => {
  it('refuse une origine étrangère ou absente', async () => {
    await expect(open({ origin: 'https://pirate.example' })).rejects.toThrow('origin_invalid');
    await expect(open({ origin: null })).rejects.toThrow('origin_invalid');
    await expect(open({ origin: null, fetchSite: 'cross-site', transport: 'polling' })).rejects.toThrow('origin_invalid');
  });

  it('fonctionne aussi en requêtes HTTP, sans WebSocket (hébergeur qui bloque les WebSockets)', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const { cookie } = await account();
    const writer = await open({ cookie, origin: null, fetchSite: 'same-origin', transport: 'polling' });
    const reader = await open({ transport: 'polling' });
    expect(writer.io.engine.transport.name).toBe('polling');
    expect((await call(writer, 'presence', 'join', exhibition.id, rooms[0])).canChat).toBe(true);
    expect((await call(reader, 'presence', 'join', exhibition.id, rooms[0])).count).toBe(2);
    const received = next(reader, 'service-event');
    await call(writer, 'chat', 'send', 'Par HTTP');
    expect((await received).result.text).toBe('Par HTTP');
  });
});

describe('visiteurs présents', () => {
  it('compte les présents d’une salle et les met à jour à l’arrivée et au départ', async () => {
    const { exhibition, title, rooms } = await publishedRooms();
    const visitors = async () => (await (await fetch(`${base}/api/exhibitions?q=${encodeURIComponent(title)}`)).json()).items[0].visitors;
    expect(await visitors()).toBe(0);
    const a = await open();
    const b = await open();
    expect(await call(a, 'presence', 'join', exhibition.id, rooms[0])).toEqual({ roomId: rooms[0], count: 1, canChat: false });

    const seenByA = next(a, 'app-event', presenceIs(2));
    expect((await call(b, 'presence', 'join', exhibition.id, rooms[0])).count).toBe(2);
    expect((await seenByA).value).toEqual({ roomId: rooms[0], count: 2 });

    const backToOne = next(a, 'app-event', presenceIs(1));
    await call(b, 'presence', 'join', exhibition.id, rooms[1]);
    await backToOne;
    expect(await visitors()).toBe(2);

    const otherRoom = await open();
    await call(otherRoom, 'presence', 'join', exhibition.id, rooms[1]);
    const left = next(otherRoom, 'app-event', presenceIs(1));
    b.disconnect();
    await left;
    expect(await visitors()).toBe(2);
    otherRoom.disconnect();
    await expect.poll(visitors).toBe(1);
  });

  it('refuse un brouillon, une salle d’une autre exposition et des identifiants invalides, sans trace serveur', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const owner = await newUser();
    const draft = await owner.createExhibition();
    const s = await open();
    for (const args of [
      [draft.id, draft.rooms[0].id],
      [draft.id, rooms[0]],
      [exhibition.id, draft.rooms[0].id],
      ['pas-un-uuid', rooms[0]],
      [exhibition.id, { $ne: null }],
    ]) {
      const err = await call(s, 'presence', 'join', ...args).catch((e) => e);
      expect(err).toEqual({ code: 'not_found', message: expect.any(String) });
    }
  });
});

describe('discussion de salle', () => {
  it('un visiteur anonyme lit mais ne peut pas écrire', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const s = await open();
    await call(s, 'presence', 'join', exhibition.id, rooms[0]);
    await expect(call(s, 'chat', 'send', 'Bonjour')).rejects.toMatchObject({ code: 'auth_required' });
  });

  it('un compte connecté écrit ; seule la même salle reçoit le message', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const { client, cookie } = await account();
    const writer = await open({ cookie });
    const reader = await open();
    const elsewhere = await open();
    expect((await call(writer, 'presence', 'join', exhibition.id, rooms[0])).canChat).toBe(true);
    await call(reader, 'presence', 'join', exhibition.id, rooms[0]);
    await call(elsewhere, 'presence', 'join', exhibition.id, rooms[1]);

    let leaked = false;
    elsewhere.on('service-event', () => {
      leaked = true;
    });
    const received = next(reader, 'service-event');
    const sent = await call(writer, 'chat', 'send', '  Très   belle salle  ');
    expect(sent).toMatchObject({ roomId: rooms[0], author: client.user.displayName, text: 'Très belle salle' });
    expect(await received).toEqual({ name: 'chat', action: 'send', result: sent });
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
  });

  it('refuse un message vide, trop long ou sans salle', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const { cookie } = await account();
    const s = await open({ cookie });
    await expect(call(s, 'chat', 'send', 'Bonjour')).rejects.toMatchObject({ code: 'no_room' });
    await call(s, 'presence', 'join', exhibition.id, rooms[0]);
    for (const text of ['', '   ', 'x'.repeat(CHAT_MAX + 1), 'a\u0007b', 42, { text: 'x' }]) {
      await expect(call(s, 'chat', 'send', text)).rejects.toMatchObject({ code: 'invalid_message' });
    }
    expect((await call(s, 'chat', 'send', 'x'.repeat(CHAT_MAX))).text).toHaveLength(CHAT_MAX);
  });

  it('limite à 10 messages par 30 secondes', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const { cookie } = await account();
    const s = await open({ cookie });
    await call(s, 'presence', 'join', exhibition.id, rooms[0]);
    setRateLimiting(true);
    try {
      for (let i = 0; i < 10; i++) await call(s, 'chat', 'send', `Message ${i}`);
      await expect(call(s, 'chat', 'send', 'De trop')).rejects.toMatchObject({ code: 'rate_limited' });
    } finally {
      setRateLimiting(false);
    }
  });

  it('une déconnexion ou une suspension du compte coupe l’écriture aussitôt', async () => {
    const { exhibition, rooms } = await publishedRooms();
    const first = await account();
    const s1 = await open({ cookie: first.cookie });
    await call(s1, 'presence', 'join', exhibition.id, rooms[0]);
    await call(s1, 'chat', 'send', 'Avant');
    await prisma.user.update({ where: { id: first.client.user.id }, data: { suspendedAt: new Date() } });
    await expect(call(s1, 'chat', 'send', 'Après')).rejects.toMatchObject({ code: 'auth_required' });

    const second = await account();
    const s2 = await open({ cookie: second.cookie });
    await call(s2, 'presence', 'join', exhibition.id, rooms[0]);
    await call(s2, 'chat', 'send', 'Avant');
    expect((await second.client.post('/api/auth/logout')).status).toBe(204);
    await expect(call(s2, 'chat', 'send', 'Après')).rejects.toMatchObject({ code: 'auth_required' });
  });
});
