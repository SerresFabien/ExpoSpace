// Client Prisma (MariaDB).
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { databaseSettings } from './settings.js';

const settings = databaseSettings();

// Connexions en UTC.
export const poolConfig = {
  ...settings,
  connectionLimit: 5,
  timezone: 'Z',
  initSql: "SET time_zone = '+00:00'",
};

const adapter = new PrismaMariaDb(poolConfig, { database: settings.database });

export const prisma = new PrismaClient({ adapter });

export function transaction(fn) {
  return prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
}
