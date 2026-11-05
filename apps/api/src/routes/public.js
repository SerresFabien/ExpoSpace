// Routes publiques.
import { basename } from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { notFound } from '../lib/errors.js';
import { uuidParam } from '../lib/validate.js';
import * as catalog from '../services/catalog.js';

export const publicRouter = Router();

publicRouter.get('/exhibitions', async (req, res) => {
  res.json(await catalog.listPublished(req.query));
});

publicRouter.get('/exhibitions/:id', async (req, res) => {
  res.json({ exhibition: await catalog.getPublished(uuidParam(req.params.id)) });
});

// Droits vérifiés à chaque lecture.
publicRouter.get('/artworks/:id/image', async (req, res, next) => {
  const variant = req.query.variant === 'thumb' ? 'thumb' : 'full';
  const file = await catalog.readableImage(uuidParam(req.params.id), variant, req.user);
  if (!file) throw notFound('Image introuvable ou non publique.');
  res.set('Cache-Control', 'private, no-store');
  res.type('image/webp');
  // root : empêche de sortir du dossier.
  res.sendFile(basename(file), { root: config.uploadDir, dotfiles: 'deny', etag: false, lastModified: false, cacheControl: false }, (err) => {
    if (err && !res.headersSent) next(notFound('Image introuvable.'));
  });
});
