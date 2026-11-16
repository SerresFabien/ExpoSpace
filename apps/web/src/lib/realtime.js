// Client temps réel (express-x).
import { io } from 'socket.io-client';
import { createClient } from '@jcbuisson/express-x/client';

export const REALTIME_PATH = '/api/realtime/';

export function connectRealtime() {
  // Polling HTTP, puis WebSocket si possible.
  const socket = io(window.location.origin, { path: REALTIME_PATH, transports: ['polling', 'websocket'], reconnectionAttempts: 5 });
  return { socket, app: createClient(socket) };
}
