// Protection CSRF (en-tête X-CSRF-Token).
import { config } from '../config.js';
import { randomToken, safeEqual } from '../lib/crypto.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfToken(req) {
  req.session.csrfToken ??= randomToken(32);
  return req.session.csrfToken;
}

function originAllowed(req, origin) {
  return config.publicOrigins.includes(origin) || origin === `${req.protocol}://${req.get('host')}`;
}

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !originAllowed(req, origin)) {
    return next(forbidden('origin_invalid', 'Requête refusée : origine inconnue.'));
  }
  if (!safeEqual(req.get('x-csrf-token'), req.session?.csrfToken)) {
    return next(forbidden('csrf_invalid', 'Jeton de sécurité absent ou expiré. Rechargez la page puis réessayez.'));
  }
  return next();
}
