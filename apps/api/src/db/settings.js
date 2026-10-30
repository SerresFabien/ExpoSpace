// Paramètres de connexion : DATABASE_URL ou DB_*.
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Le .env est aussi lu par les scripts.
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export function databaseSettings(env = process.env) {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') {
      throw new Error('DATABASE_URL doit commencer par mysql:// (base MariaDB).');
    }
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      socketPath: url.searchParams.get('socket') || undefined,
    };
  }
  if (!env.DB_NAME || !env.DB_USER) {
    throw new Error('Base de données non configurée : définir DATABASE_URL, ou DB_NAME, DB_USER et DB_PASSWORD (voir .env.example).');
  }
  return {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME,
    socketPath: env.DB_SOCKET || undefined,
  };
}

export function databaseUrl(settings = databaseSettings()) {
  const auth = `${encodeURIComponent(settings.user)}:${encodeURIComponent(settings.password)}`;
  const socket = settings.socketPath ? `?socket=${encodeURIComponent(settings.socketPath)}` : '';
  return `mysql://${auth}@${settings.host}:${settings.port}/${encodeURIComponent(settings.database)}${socket}`;
}
