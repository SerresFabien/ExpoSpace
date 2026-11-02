// Profil de l'utilisateur connecté.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { limiters } from '../middleware/rateLimit.js';
import { saveSession } from '../middleware/session.js';
import * as accounts from '../services/accounts.js';
import { publicUser } from '../services/presenters.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

meRouter.patch('/', requireAuth, async (req, res) => {
  const user = await accounts.updateProfile(req.user, req.body);
  res.json({ user: publicUser(user) });
});

meRouter.post('/password', requireAuth, async (req, res) => {
  limiters.passwordByUser.check(req.user.id);
  let user;
  try {
    user = await accounts.changePassword(req.user, req.body);
  } catch (err) {
    if (err.code === 'invalid_password') limiters.passwordByUser.hit(req.user.id);
    throw err;
  }
  req.session.sessionVersion = user.sessionVersion;
  await saveSession(req);
  res.json({ user: publicUser(user) });
});
