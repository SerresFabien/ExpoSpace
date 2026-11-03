import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { setRateLimiting } from '../src/middleware/rateLimit.js';
import { Client, PASSWORD, anonymous, newUser, uniqueUsername } from './helpers.js';

describe('inscription et connexion (T01)', () => {
  it('crée le compte dans PostgreSQL et ouvre une session', async () => {
    const c = await anonymous();
    const username = uniqueUsername('camille');
    const res = await c.register({ username, displayName: 'Camille' });
    expect(res.body.user).toMatchObject({ username, displayName: 'Camille', role: 'USER' });
    expect(res.body.recoveryCode).toMatch(/^([0-9A-Z]{5}-){5}[0-9A-Z]{5}$/);
    expect(await prisma.user.count({ where: { usernameKey: username } })).toBe(1);
    const me = await c.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(username);
  });

  it('normalise l’identifiant en minuscules et refuse les doublons', async () => {
    const base = uniqueUsername('Dup');
    const a = await anonymous();
    const res = await a.register({ username: base.toUpperCase() });
    expect(res.body.user.username).toBe(base.toLowerCase());
    const b = await anonymous();
    const dup = await b.post('/api/auth/register', { username: base.toLowerCase(), displayName: 'X', password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('username_taken');
  });

  it('valide identifiant, nom affiché et mot de passe', async () => {
    const c = await anonymous();
    const res = await c.post('/api/auth/register', { username: 'a!', displayName: '', password: 'court' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
    expect(Object.keys(res.body.fields).sort()).toEqual(['displayName', 'password', 'username']);
    const extra = await c.post('/api/auth/register', { username: uniqueUsername(), displayName: 'X', password: PASSWORD, email: 'x@y.z' });
    expect(extra.status).toBe(400);
    expect(extra.body.fields.email).toBeDefined();
  });

  it('se reconnecte après déconnexion ; erreurs de connexion génériques', async () => {
    const c = await newUser();
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect((await c.get('/api/me')).status).toBe(401);
    await c.init();
    const wrong = await c.login(c.user.username, 'mauvais-mot-de-passe');
    const unknown = await c.login(uniqueUsername('inconnu'), 'mauvais-mot-de-passe');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    const ok = await c.login(c.user.username.toUpperCase(), PASSWORD);
    expect(ok.status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(200);
  });

  it('ne renvoie jamais de hash ni de secret', async () => {
    const c = await anonymous();
    const res = await c.register();
    const text = JSON.stringify(res.body) + JSON.stringify((await c.get('/api/me')).body);
    expect(text).not.toMatch(/hash|argon|sid/i);
  });
});

describe('stockage des secrets (T02)', () => {
  it('ne stocke ni mot de passe ni code de récupération en clair', async () => {
    const c = await newUser();
    const row = await prisma.user.findUnique({ where: { id: c.user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.recoveryCodeHash).toMatch(/^\$argon2id\$/);
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain(c.recoveryCode);
    expect(dump).not.toContain(c.recoveryCode.replaceAll('-', ''));
  });
});

describe('protection CSRF et origine', () => {
  it('refuse une écriture sans jeton, avec un mauvais jeton ou depuis une autre origine', async () => {
    const c = await newUser();
    const noToken = await c.agent.post('/api/me/exhibitions').send({ title: 'X' });
    expect(noToken.status).toBe(403);
    expect(noToken.body.code).toBe('csrf_invalid');
    const badToken = await c.agent.post('/api/me/exhibitions').set('X-CSRF-Token', 'faux').send({ title: 'X' });
    expect(badToken.status).toBe(403);
    const otherOrigin = await c.agent.post('/api/me/exhibitions').set('X-CSRF-Token', c.csrf).set('Origin', 'https://pirate.example').send({ title: 'X' });
    expect(otherOrigin.status).toBe(403);
    expect(otherOrigin.body.code).toBe('origin_invalid');
  });

  it('protège aussi la connexion', async () => {
    const c = new Client();
    const res = await c.agent.post('/api/auth/login').send({ username: 'x', password: 'y' });
    expect(res.status).toBe(403);
  });
});

describe('récupération par code (T03)', () => {
  it('remplace le mot de passe, invalide les sessions et l’ancien code', async () => {
    const owner = await newUser();
    const otherDevice = await anonymous();
    expect((await otherDevice.login(owner.user.username, PASSWORD)).status).toBe(200);

    const r = await anonymous();
    const newPassword = 'un-tout-nouveau-mot-de-passe';
    const res = await r.post('/api/auth/recover', { username: owner.user.username, recoveryCode: owner.recoveryCode.toLowerCase(), newPassword });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCode).toMatch(/^([0-9A-Z]{5}-){5}[0-9A-Z]{5}$/);
    expect(res.body.recoveryCode).not.toBe(owner.recoveryCode);

    expect((await owner.get('/api/me')).status).toBe(401);
    expect((await otherDevice.get('/api/me')).status).toBe(401);
    const reuse = await (await anonymous()).post('/api/auth/recover', { username: owner.user.username, recoveryCode: owner.recoveryCode, newPassword: 'encore-un-autre-mot-de-passe' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('recovery_failed');
    expect((await (await anonymous()).login(owner.user.username, PASSWORD)).status).toBe(401);
    expect((await (await anonymous()).login(owner.user.username, newPassword)).status).toBe(200);
  });
});

describe('profil et mot de passe', () => {
  it('modifie le nom affiché', async () => {
    const c = await newUser();
    const res = await c.patch('/api/me', { displayName: '  Nouvelle Signature  ' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Nouvelle Signature');
  });

  it('change le mot de passe avec l’ancien et invalide les autres sessions', async () => {
    const c = await newUser();
    const other = await anonymous();
    await other.login(c.user.username, PASSWORD);
    const wrong = await c.post('/api/me/password', { currentPassword: 'pas-le-bon-mot', newPassword: 'nouveau-mot-de-passe-1' });
    expect(wrong.status).toBe(400);
    const ok = await c.post('/api/me/password', { currentPassword: PASSWORD, newPassword: 'nouveau-mot-de-passe-1' });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(200);
    expect((await other.get('/api/me')).status).toBe(401);
  });
});

describe('limitation de fréquence', () => {
  it('bloque les essais répétés sur un identifiant (429)', async () => {
    setRateLimiting(true);
    try {
      const c = await newUser();
      const attacker = await anonymous();
      for (let i = 0; i < 10; i++) expect((await attacker.login(c.user.username, `faux-${i}-mot-de-passe`)).status).toBe(401);
      const blocked = await attacker.login(c.user.username, PASSWORD);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      setRateLimiting(false);
    }
  });
});
