// Routes d'authentification.
import { Router } from 'express';
import { csrfToken } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { limiters } from '../middleware/rateLimit.js';
import { SESSION_COOKIE, destroySession, regenerateSession, saveSession } from '../middleware/session.js';
import { randomToken } from '../lib/crypto.js';
import * as accounts from '../services/accounts.js';
import { publicUser } from '../services/presenters.js';

export const authRouter = Router();

// Nouvelle session à la connexion (fixation de session).
async function openSession(req, user) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.sessionVersion = user.sessionVersion;
  req.session.loginAt = Date.now();
  req.session.csrfToken = randomToken(32);
  await saveSession(req);
}

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: csrfToken(req), user: req.user ? publicUser(req.user) : null });
});

authRouter.post('/register', async (req, res) => {
  limiters.registerByIp.check(req.ip);
  limiters.registerByIp.hit(req.ip);
  const { user, recoveryCode } = await accounts.register(req.body);
  await openSession(req, user);
  res.status(201).json({ user: publicUser(user), recoveryCode, csrfToken: req.session.csrfToken });
});

authRouter.post('/login', async (req, res) => {
  const key = accounts.usernameKey(req.body?.username);
  limiters.loginByIp.check(req.ip);
  limiters.loginByUser.check(key);
  let user;
  try {
    user = await accounts.login(req.body);
  } catch (err) {
    if (err.status === 401) {
      limiters.loginByIp.hit(req.ip);
      limiters.loginByUser.hit(key);
    }
    throw err;
  }
  limiters.loginByUser.reset(key);
  await openSession(req, user);
  res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRouter.post('/recover', async (req, res) => {
  const key = accounts.usernameKey(req.body?.username);
  limiters.recoverByIp.check(req.ip);
  limiters.recoverByUser.check(key);
  let result;
  try {
    result = await accounts.recover(req.body);
  } catch (err) {
    if (err.code === 'recovery_failed') {
      limiters.recoverByIp.hit(req.ip);
      limiters.recoverByUser.hit(key);
    }
    throw err;
  }
  limiters.recoverByUser.reset(key);
  await openSession(req, result.user);
  res.json({ user: publicUser(result.user), recoveryCode: result.recoveryCode, csrfToken: req.session.csrfToken });
});
