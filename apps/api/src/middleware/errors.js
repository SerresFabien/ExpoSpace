// 404 de l'API, maintenance et format des erreurs.
import { existsSync } from 'node:fs';
import multer from 'multer';
import { LIMITS } from '@expospace/shared/limits.js';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export function apiNotFound(_req, _res, next) {
  next(new AppError(404, 'not_found', 'Ressource introuvable.'));
}

export function maintenanceGuard(req, _res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path.startsWith('/auth/')) return next();
  if (!existsSync(config.maintenanceFile)) return next();
  const err = new AppError(503, 'maintenance', 'Sauvegarde en cours : les modifications sont suspendues quelques minutes. Réessayez bientôt.');
  err.retryAfter = 300;
  return next(err);
}

function translate(err) {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'file_too_large', `Fichier trop volumineux : ${LIMITS.uploadMaxBytes / (1024 * 1024)} Mio au maximum.`);
    }
    return new AppError(400, 'upload_invalid', 'Envoi de fichier invalide : une seule image, dans le champ « image ».');
  }
  if (err?.type === 'entity.too.large') return new AppError(413, 'body_too_large', 'Requête trop volumineuse.');
  if (err?.type === 'entity.parse.failed') return new AppError(400, 'invalid_json', 'Corps JSON invalide.');
  if (err?.code === 'P2002') return new AppError(409, 'conflict', 'Conflit avec une donnée existante. Rechargez puis réessayez.');
  return null;
}

// Quatre paramètres : gestionnaire d'erreurs Express.
export function errorHandler(err, req, res, _next) {
  const known = translate(err);
  if (!known) {
    console.error(`[api] erreur ${req.method} ${req.originalUrl}`, err);
    return res.status(500).json({ code: 'internal_error', message: 'Erreur interne du serveur. Réessayez plus tard.' });
  }
  if (known.retryAfter) res.set('Retry-After', String(known.retryAfter));
  const body = { code: known.code, message: known.message };
  if (known.fields) body.fields = known.fields;
  return res.status(known.status).json(body);
}
