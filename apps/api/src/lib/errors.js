// Erreurs applicatives : { code, message, fields }.
export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (code, message, fields) => new AppError(400, code, message, fields);
export const unauthorized = (message = 'Connexion requise.') => new AppError(401, 'auth_required', message);
export const forbidden = (code = 'forbidden', message = 'Action non autorisée.') => new AppError(403, code, message);
export const notFound = (message = 'Ressource introuvable.') => new AppError(404, 'not_found', message);
export const conflict = (code, message, fields) => new AppError(409, code, message, fields);
export const tooMany = (retryAfterSeconds, message = 'Trop de tentatives. Réessayez plus tard.') => {
  const err = new AppError(429, 'rate_limited', message);
  err.retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return err;
};

export const preconditionRequired = () =>
  new AppError(428, 'precondition_required', 'En-tête If-Match manquant : rechargez l’exposition avant de la modifier.');

export const versionConflict = () =>
  new AppError(412, 'version_conflict', 'Cette exposition a été modifiée ailleurs (autre onglet ou appareil). Rechargez la page puis réappliquez vos changements.');

export const publishedLocked = () =>
  new AppError(409, 'exhibition_published', 'Cette exposition est publiée et donc verrouillée. Dépubliez-la pour la modifier.');
