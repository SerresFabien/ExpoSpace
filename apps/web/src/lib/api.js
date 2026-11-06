// Client de l'API : session, CSRF, If-Match, erreurs.
let csrfToken = null;
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Erreur ${status}`);
    this.status = status;
    this.code = body?.code ?? 'unknown_error';
    this.fields = body?.fields ?? {};
  }
}

const networkError = () => new ApiError(0, { code: 'network_error', message: 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.' });

export function setCsrfToken(token) {
  csrfToken = token;
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

let pendingBootstrap = null;

// Requête partagée entre appels simultanés.
export function bootstrap() {
  pendingBootstrap ??= api('/auth/csrf')
    .then((data) => {
      csrfToken = data.csrfToken;
      return data;
    })
    .finally(() => {
      pendingBootstrap = null;
    });
  return pendingBootstrap;
}

async function ensureCsrf() {
  if (!csrfToken) await bootstrap();
  return csrfToken;
}

async function readJson(res) {
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export async function api(path, { method = 'GET', body, etag, retryCsrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-Match'] = etag;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw networkError();
  }
  const data = await readJson(res);
  if (res.ok) return data;
  // Seul un refus CSRF est retenté, jamais un 412.
  if (res.status === 403 && data?.code === 'csrf_invalid' && retryCsrf) {
    csrfToken = null;
    return api(path, { method, body, etag, retryCsrf: false });
  }
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  throw new ApiError(res.status, data);
}

// XHR pour suivre la progression de l'envoi.
export async function uploadImage(exhibitionId, etag, file, fields, onProgress) {
  const token = await ensureCsrf();
  const form = new FormData();
  form.append('rightsConfirmed', 'true');
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value);
  form.append('image', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/me/exhibitions/${exhibitionId}/artworks`);
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.setRequestHeader('If-Match', etag);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401) onUnauthorized();
      return reject(new ApiError(xhr.status, data ?? { message: xhr.status === 413 ? 'Fichier trop volumineux.' : undefined }));
    };
    xhr.onerror = () => reject(networkError());
    xhr.send(form);
  });
}
