// Comptes : inscription, connexion, récupération.
import argon2 from 'argon2';
import { LIMITS, USERNAME_PATTERN } from '@expospace/shared/limits.js';
import { prisma } from '../db/prisma.js';
import { generateRecoveryCode, normalizeRecoveryCode } from '../lib/crypto.js';
import { AppError, badRequest, conflict, forbidden } from '../lib/errors.js';
import { parse, plainText, z } from '../lib/validate.js';

// Paramètres OWASP.
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashSecret = (secret) => argon2.hash(secret, HASH_OPTIONS);

async function verifySecret(hash, secret) {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

let dummyHash;
// Même durée, que le compte existe ou non.
async function dummyVerify(secret) {
  dummyHash ??= await hashSecret('expospace-dummy-password');
  await verifySecret(dummyHash, secret);
  return false;
}

const usernameField = z
  .string({ error: 'Identifiant obligatoire.' })
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, `Identifiant : ${LIMITS.usernameMin} à ${LIMITS.usernameMax} caractères parmi a-z, 0-9 et _.`);

const passwordField = z
  .string({ error: 'Mot de passe obligatoire.' })
  .min(LIMITS.passwordMin, `Au moins ${LIMITS.passwordMin} caractères.`)
  .max(LIMITS.passwordMax, `Au plus ${LIMITS.passwordMax} caractères.`);

const displayNameField = plainText(LIMITS.displayNameMax).pipe(
  z.string().min(1, 'Nom affiché obligatoire.').max(LIMITS.displayNameMax, `Au plus ${LIMITS.displayNameMax} caractères.`),
);

const registerSchema = z.strictObject({ username: usernameField, displayName: displayNameField, password: passwordField });
const loginSchema = z.strictObject({ username: z.string().max(100), password: z.string().max(1000) });
const recoverSchema = z.strictObject({ username: z.string().max(100), recoveryCode: z.string().max(200), newPassword: passwordField });
const profileSchema = z.strictObject({ displayName: displayNameField });
const passwordChangeSchema = z.strictObject({ currentPassword: z.string().max(1000), newPassword: passwordField });

export const usernameKey = (input) => String(input ?? '').trim().toLowerCase();

const invalidCredentials = () => new AppError(401, 'invalid_credentials', 'Identifiant ou mot de passe incorrect.');
const accountSuspended = () => forbidden('account_suspended', 'Ce compte est suspendu.');

export async function register(body) {
  const data = parse(registerSchema, body);
  if (data.password.toLowerCase().includes(data.username) && data.username.length >= 4) {
    throw badRequest('validation_failed', 'Certaines informations sont invalides.', { password: 'Le mot de passe ne doit pas contenir l’identifiant.' });
  }
  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(data.password), hashSecret(normalizeRecoveryCode(recoveryCode))]);
  try {
    const user = await prisma.user.create({
      data: { usernameKey: data.username, displayName: data.displayName, passwordHash, recoveryCodeHash },
    });
    return { user, recoveryCode };
  } catch (err) {
    if (err?.code === 'P2002') throw conflict('username_taken', 'Cet identifiant est déjà utilisé.', { username: 'Cet identifiant est déjà utilisé.' });
    throw err;
  }
}

export async function login(body) {
  const data = parse(loginSchema, body);
  const user = await prisma.user.findUnique({ where: { usernameKey: usernameKey(data.username) } });
  if (!user) {
    await dummyVerify(data.password);
    throw invalidCredentials();
  }
  if (!(await verifySecret(user.passwordHash, data.password))) throw invalidCredentials();
  if (user.suspendedAt) throw accountSuspended();
  return user;
}

export async function recover(body) {
  const data = parse(recoverSchema, body);
  const key = usernameKey(data.username);
  const user = await prisma.user.findUnique({ where: { usernameKey: key } });
  const code = normalizeRecoveryCode(data.recoveryCode);
  const ok = user ? await verifySecret(user.recoveryCodeHash, code) : await dummyVerify(code);
  if (!ok) throw new AppError(400, 'recovery_failed', 'Identifiant ou code de récupération incorrect.');
  if (user.suspendedAt) throw accountSuspended();

  const newCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hashSecret(data.newPassword), hashSecret(normalizeRecoveryCode(newCode))]);
  // Usage unique, même en cas de requêtes simultanées.
  const updated = await prisma.user.updateMany({
    where: { id: user.id, recoveryCodeHash: user.recoveryCodeHash },
    data: { passwordHash, recoveryCodeHash, sessionVersion: { increment: 1 } },
  });
  if (updated.count !== 1) throw new AppError(400, 'recovery_failed', 'Identifiant ou code de récupération incorrect.');
  return { user: await prisma.user.findUnique({ where: { id: user.id } }), recoveryCode: newCode };
}

export async function updateProfile(user, body) {
  const data = parse(profileSchema, body);
  return prisma.user.update({ where: { id: user.id }, data: { displayName: data.displayName } });
}

export async function changePassword(user, body) {
  const data = parse(passwordChangeSchema, body);
  if (!(await verifySecret(user.passwordHash, data.currentPassword))) {
    throw badRequest('invalid_password', 'Le mot de passe actuel est incorrect.', { currentPassword: 'Mot de passe actuel incorrect.' });
  }
  const passwordHash = await hashSecret(data.newPassword);
  return prisma.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
}
