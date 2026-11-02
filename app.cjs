// Point d'entrée Passenger (CommonJS) : charge le serveur ESM.
import('./apps/api/src/server.js').catch((err) => {
  console.error('[expospace] démarrage impossible :', err);
  process.exit(1);
});
