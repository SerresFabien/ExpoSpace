// Aléa, comparaison en temps constant, codes de récupération.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 30 caractères base32, sans caractères ambigus.
export function generateRecoveryCode() {
  const bytes = randomBytes(30);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return out.match(/.{5}/g).join('-');
}

export function normalizeRecoveryCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}
