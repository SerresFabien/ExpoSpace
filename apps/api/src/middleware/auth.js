// Session et rôles.
import { prisma } from '../db/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { SESSION_MAX_MS } from './session.js';

// Null si compte supprimé ou suspendu, mot de passe changé ou session expirée.
export async function userFromSession(s) {
  if (!s?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  const tooOld = !s.loginAt || Date.now() - s.loginAt > SESSION_MAX_MS;
  return !user || user.suspendedAt || user.sessionVersion !== s.sessionVersion || tooOld ? null : user;
}

export async function loadUser(req, _res, next) {
  req.user = null;
  const s = req.session;
  if (!s?.userId) return next();
  try {
    const user = await userFromSession(s);
    if (!user) {
      delete s.userId;
      delete s.sessionVersion;
      delete s.loginAt;
      return next();
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAuth(req, _res, next) {
  return next(req.user ? undefined : unauthorized());
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') return next(forbidden('admin_required', 'Action réservée aux administrateurs.'));
  return next();
}
