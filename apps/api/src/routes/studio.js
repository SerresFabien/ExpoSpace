// Espace créateur (écritures avec If-Match).
import { rm } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { LIMITS } from '@expospace/shared/limits.js';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { uuidParam } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as artworks from '../services/artworks.js';
import * as exhibitions from '../services/exhibitions.js';
import { acquireUploadSlot, removeUploads } from '../services/images.js';

export const studioRouter = Router();
studioRouter.use(requireAuth);

function sendExhibition(res, exhibition, status = 200, extra = {}) {
  res.status(status).set('ETag', exhibition.etag).json({ exhibition, ...extra });
}

studioRouter.get('/', async (req, res) => {
  res.json({ exhibitions: await exhibitions.listMine(req.user.id) });
});

studioRouter.post('/', async (req, res) => {
  sendExhibition(res, await exhibitions.createExhibition(req.user.id, req.body), 201);
});

studioRouter.get('/:id', async (req, res) => {
  sendExhibition(res, await exhibitions.getStudio(req.user.id, uuidParam(req.params.id)));
});

studioRouter.patch('/:id', async (req, res) => {
  const result = await exhibitions.updateExhibition(req.user.id, uuidParam(req.params.id), req.get('if-match'), req.body);
  sendExhibition(res, result.exhibition);
});

studioRouter.delete('/:id', async (req, res) => {
  const result = await exhibitions.deleteExhibition(req.user.id, uuidParam(req.params.id), req.get('if-match'));
  await removeUploads(result.files);
  res.status(204).end();
});

studioRouter.post('/:id/rooms', async (req, res) => {
  const result = await exhibitions.addRoom(req.user.id, uuidParam(req.params.id), req.get('if-match'), req.body);
  sendExhibition(res, result.exhibition, 201);
});

studioRouter.delete('/:id/rooms/:roomId', async (req, res) => {
  const result = await exhibitions.deleteRoom(req.user.id, uuidParam(req.params.id), uuidParam(req.params.roomId), req.get('if-match'));
  sendExhibition(res, result.exhibition);
});

studioRouter.patch('/:id/rooms/:roomId', async (req, res) => {
  const result = await exhibitions.updateRoom(req.user.id, uuidParam(req.params.id), uuidParam(req.params.roomId), req.get('if-match'), req.body);
  sendExhibition(res, result.exhibition);
});

studioRouter.put('/:id/placements', async (req, res) => {
  const result = await exhibitions.replacePlacements(req.user.id, uuidParam(req.params.id), req.get('if-match'), req.body);
  sendExhibition(res, result.exhibition);
});

studioRouter.post('/:id/publish', async (req, res) => {
  const result = await exhibitions.publish(req.user.id, uuidParam(req.params.id), req.get('if-match'));
  sendExhibition(res, result.exhibition);
});

studioRouter.post('/:id/unpublish', async (req, res) => {
  const result = await exhibitions.unpublish(req.user.id, uuidParam(req.params.id), req.get('if-match'));
  sendExhibition(res, result.exhibition);
});

const receiveImage = multer({
  dest: config.tmpDir,
  limits: { fileSize: LIMITS.uploadMaxBytes, files: 1, fields: 10, fieldSize: 10_000, parts: 12 },
}).single('image');

const receive = (req, res) => new Promise((ok, ko) => receiveImage(req, res, (err) => (err ? ko(err) : ok())));

studioRouter.post('/:id/artworks', async (req, res) => {
  const id = uuidParam(req.params.id);
  const ifMatch = req.get('if-match');
  // Contrôles avant réception du fichier.
  await artworks.precheckUpload(req.user.id, id, ifMatch);
  const release = acquireUploadSlot(req.user.id);
  try {
    await receive(req, res);
    if (!req.file) throw badRequest('file_required', 'Aucune image reçue (champ « image »).');
    const fields = artworks.parseUploadFields(req.body);
    const result = await artworks.createFromUpload(req.user.id, id, ifMatch, req.file.path, fields);
    sendExhibition(res, result.exhibition, 201, { artworkId: result.artworkId });
  } finally {
    release();
    if (req.file?.path) await rm(req.file.path, { force: true }).catch(() => {});
  }
});

studioRouter.patch('/:id/artworks/:artworkId', async (req, res) => {
  const result = await artworks.updateArtwork(req.user.id, uuidParam(req.params.id), uuidParam(req.params.artworkId), req.get('if-match'), req.body);
  sendExhibition(res, result.exhibition);
});

studioRouter.delete('/:id/artworks/:artworkId', async (req, res) => {
  const result = await artworks.deleteArtwork(req.user.id, uuidParam(req.params.id), uuidParam(req.params.artworkId), req.get('if-match'));
  sendExhibition(res, result.exhibition);
});
