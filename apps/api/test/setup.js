import { afterAll } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { closeSessionStore } from '../src/middleware/session.js';

afterAll(async () => {
  await closeSessionStore();
  await prisma.$disconnect();
});
