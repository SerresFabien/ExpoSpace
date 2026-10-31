// Sessions : cookie HttpOnly, SameSite=Lax, Secure en production.
import session from 'express-session';
import { LIMITS } from '@expospace/shared/limits.js';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { PrismaSessionStore } from './sessionStore.js';

export const SESSION_COOKIE = 'expospace_sid';
export const SESSION_MAX_MS = LIMITS.sessionDays * 24 * 3600 * 1000;

let store;

export function sessionMiddleware() {
  store ??= new PrismaSessionStore({
    prisma,
    defaultMaxAgeMs: SESSION_MAX_MS,
    pruneIntervalMs: config.isTest ? 0 : 15 * 60 * 1000,
  });
  return session({
    name: SESSION_COOKIE,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    unset: 'destroy',
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_MS,
    },
  });
}

export async function closeSessionStore() {
  store?.close();
  store = undefined;
}

export const regenerateSession = (req) => new Promise((ok, ko) => req.session.regenerate((err) => (err ? ko(err) : ok())));
export const saveSession = (req) => new Promise((ok, ko) => req.session.save((err) => (err ? ko(err) : ok())));
export const destroySession = (req) => new Promise((ok, ko) => (req.session ? req.session.destroy((err) => (err ? ko(err) : ok())) : ok()));
