// Routes d'administration.
import { Router } from 'express';
import { uuidParam } from '../lib/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import * as admin from '../services/admin.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/users', async (req, res) => {
  res.json({ users: await admin.listUsers(req.query) });
});

adminRouter.get('/exhibitions', async (req, res) => {
  res.json({ exhibitions: await admin.listExhibitions(req.query) });
});

adminRouter.post('/exhibitions/:id/suspend', async (req, res) => {
  res.json(await admin.setExhibitionSuspended(uuidParam(req.params.id), true));
});

adminRouter.post('/exhibitions/:id/unsuspend', async (req, res) => {
  res.json(await admin.setExhibitionSuspended(uuidParam(req.params.id), false));
});

adminRouter.post('/users/:id/suspend', async (req, res) => {
  res.json(await admin.setUserSuspended(req.user, uuidParam(req.params.id), true));
});

adminRouter.post('/users/:id/unsuspend', async (req, res) => {
  res.json(await admin.setUserSuspended(req.user, uuidParam(req.params.id), false));
});
