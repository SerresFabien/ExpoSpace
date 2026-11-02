// Démarrage et arrêt du serveur.
import { config } from './config.js';
import { prisma } from './db/prisma.js';
import { closeSessionStore } from './middleware/session.js';
import { createRealtimeApp } from './realtime.js';

try {
  await prisma.$queryRaw`SELECT 1`;
} catch (err) {
  console.error(`[api] MariaDB ne répond pas (${err?.message ?? err}). Démarrez-le (npm run db:start) et vérifiez DATABASE_URL.`);
  process.exit(1);
}

// Un seul serveur HTTP pour l'API et le temps réel.
const app = createRealtimeApp();
app.httpServer.listen(config.port, config.host, () => {
  console.log(`[api] ExpoSpace écoute sur http://${config.host}:${config.port} (${config.nodeEnv})`);
  console.log(`[api] images : ${config.uploadDir}`);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[api] ${signal} reçu, arrêt…`);
  app.io.close(async () => {
    await closeSessionStore().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
