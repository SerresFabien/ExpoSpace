// Validation Zod (messages en français).
import { z } from 'zod';
import { badRequest, notFound } from './errors.js';

z.config(z.locales.fr());

export { z };

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[key] = 'Champ non autorisé.';
      continue;
    }
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw badRequest('validation_failed', 'Certaines informations sont invalides.', fields);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound();
  return value.toLowerCase();
}

export const plainText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    // eslint-disable-next-line no-control-regex -- détection voulue des caractères de contrôle
    .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s), 'Caractères de contrôle interdits.');
