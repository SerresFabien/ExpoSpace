// Temps réel (express-x) : présence et discussion par salle.
// Facultatif : WebSocket ou polling HTTP.
import { randomUUID } from 'node:crypto';
import { expressX } from '@jcbuisson/express-x/server';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db/prisma.js';
import { plainText, z } from './lib/validate.js';
import { userFromSession } from './middleware/auth.js';
import { RateLimiter } from './middleware/rateLimit.js';
import { sessionMiddleware } from './middleware/session.js';
import { PUBLIC_WHERE } from './services/catalog.js';
import { setVisitorCounter } from './services/presence.js';

export const REALTIME_PATH = '/api/realtime/';
export const CHAT_MAX = 300;

const chatLimiter = new RateLimiter({ max: 10, windowMs: 30_000 });
const idField = z.uuid();
const messageField = plainText(CHAT_MAX).pipe(z.string().min(1));

// Refus sans pile d'appels (express-x renvoie celle des Error).
class Refusal {
  constructor(code, message) {
    this.code = code;
    this.message = message;
  }
}

function guarded(method) {
  return async function (...args) {
    try {
      return await method.apply(this, args);
    } catch (err) {
      if (err instanceof Refusal) throw err;
      if (err?.status === 429) throw new Refusal('rate_limited', 'Trop de messages : patientez quelques secondes.');
      console.error('[realtime]', err);
      throw new Refusal('server_error', 'Erreur du serveur temps réel.');
    }
  };
}

// Sans Origin : accepté seulement pour une requête du même site.
function originAllowed({ origin, host, 'sec-fetch-site': fetchSite }) {
  if (!origin) return fetchSite === 'same-origin';
  if (config.publicOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Session relue à chaque message.
function reloadSession(session) {
  return new Promise((resolve) => (session ? session.reload((err) => resolve(err ? null : session)) : resolve(null)));
}

// Application express-x contenant l'API.
export function createRealtimeApp() {
  const app = expressX({ WS_PATH: REALTIME_PATH });
  app.disable('x-powered-by');
  app.use(createApp());
  return setupRealtime(app);
}

export function setupRealtime(app) {
  const { io } = app;
  // Pas de journal verbose (il contient les messages).
  app.set('logger', { log: (severity, message) => severity !== 'verbose' && console.log(`[realtime] ${message}`) });

  io.engine.use(sessionMiddleware());
  io.use(async (socket, next) => {
    if (!originAllowed(socket.handshake.headers)) return next(new Error('origin_invalid'));
    try {
      const user = await userFromSession(socket.request.session);
      socket.data.userId = user?.id ?? null;
      return next();
    } catch (err) {
      console.error('[realtime]', err);
      return next(new Error('server_error'));
    }
  });

  const countOf = (channel) => io.sockets.adapter.rooms.get(channel)?.size ?? 0;
  const announce = (channel, count) => io.to(channel).emit('app-event', { type: 'presence', value: { roomId: channel.slice(5), count } });

  // Canal par exposition, pour le compteur du catalogue.
  setVisitorCounter((exhibitionId) => countOf(`expo:${exhibitionId}`));

  function leave(socket) {
    const channel = socket.data.channel;
    if (!channel) return;
    app.leaveChannel(channel, socket);
    app.leaveChannel(socket.data.exhibitionChannel, socket);
    socket.data.channel = null;
    socket.data.exhibitionChannel = null;
    announce(channel, countOf(channel));
  }

  app.addDisconnectingListener((socket) => {
    const channel = socket.data.channel;
    if (channel) io.to(channel).except(socket.id).emit('app-event', { type: 'presence', value: { roomId: channel.slice(5), count: countOf(channel) - 1 } });
  });

  app.createService('presence', {
    join: guarded(async function (exhibitionId, roomId) {
      if (!idField.safeParse(exhibitionId).success || !idField.safeParse(roomId).success) throw new Refusal('not_found', 'Salle introuvable.');
      const room = await prisma.room.findFirst({ where: { id: roomId, exhibition: { id: exhibitionId, ...PUBLIC_WHERE } }, select: { id: true } });
      if (!room) throw new Refusal('not_found', 'Salle introuvable ou exposition indisponible.');
      leave(this.socket);
      const channel = `room:${roomId}`;
      app.joinChannel(channel, this.socket);
      app.joinChannel(`expo:${exhibitionId}`, this.socket);
      this.socket.data.channel = channel;
      this.socket.data.exhibitionChannel = `expo:${exhibitionId}`;
      announce(channel, countOf(channel));
      return { roomId, count: countOf(channel), canChat: Boolean(this.socket.data.userId) };
    }),
    leave: guarded(async function () {
      leave(this.socket);
      return { ok: true };
    }),
  });

  app.createService('chat', {
    send: guarded(async function (text) {
      const channel = this.socket.data.channel;
      if (!channel) throw new Refusal('no_room', 'Entrez d’abord dans une salle.');
      const parsed = messageField.safeParse(typeof text === 'string' ? text.replace(/\s+/g, ' ') : '');
      if (!parsed.success) throw new Refusal('invalid_message', `Un message contient de 1 à ${CHAT_MAX} caractères.`);
      chatLimiter.check(this.user.id);
      chatLimiter.hit(this.user.id);
      return { id: randomUUID(), roomId: channel.slice(5), author: this.user.displayName, text: parsed.data, at: new Date().toISOString() };
    }),
  });

  // Écriture réservée aux comptes connectés.
  app.service('chat').hooks({
    before: {
      send: [
        guarded(async (context) => {
          const user = await userFromSession(await reloadSession(context.socket?.request.session));
          if (!user) throw new Refusal('auth_required', 'Connectez-vous pour écrire dans la discussion.');
          context.user = user;
        }),
      ],
    },
  });
  // Diffusion à la salle de l'auteur.
  app.service('chat').publish(async (context) => [context.socket.data.channel]);

  return app;
}
