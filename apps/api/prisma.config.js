// Configuration de la CLI Prisma.
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { databaseSettings, databaseUrl } from './src/db/settings.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

let url = 'mysql://placeholder:placeholder@localhost:3306/placeholder';
try {
  url = databaseUrl(databaseSettings());
} catch {
  // Sans base configurée : commandes hors connexion uniquement.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
