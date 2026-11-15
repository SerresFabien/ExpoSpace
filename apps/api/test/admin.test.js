import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { PASSWORD, anonymous, newUser, publish, readyExhibition } from './helpers.js';

async function newAdmin() {
  const admin = await newUser();
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'ADMIN' } });
  return admin;
}

describe('accès à l’administration', () => {
  it('refuse les visiteurs (401) et les utilisateurs ordinaires (403)', async () => {
    const someone = await newUser();
    expect((await (await anonymous()).get('/api/admin/users')).status).toBe(401);
    const res = await someone.get('/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('admin_required');
    expect((await someone.post(`/api/admin/users/${someone.user.id}/suspend`)).status).toBe(403);
  });

  it('le rôle public reste USER : impossible de s’inscrire administrateur', async () => {
    const c = await anonymous();
    const res = await c.post('/api/auth/register', { username: 'pirate_admin', displayName: 'X', password: PASSWORD, role: 'ADMIN' });
    expect(res.status).toBe(400);
  });
});

describe('suspension d’une exposition (T25)', () => {
  it('bloque la diffusion ; republier ne contourne pas la suspension', async () => {
    const admin = await newAdmin();
    const c = await newUser();
    const { exhibition, artworkIds } = await readyExhibition(c, 1);
    const pub = await publish(c, exhibition);

    const listed = await admin.get('/api/admin/exhibitions');
    expect(listed.body.exhibitions.map((e) => e.id)).toContain(pub.id);
    expect((await admin.post(`/api/admin/exhibitions/${pub.id}/suspend`)).body).toEqual({ id: pub.id, suspended: true });

    const visitor = await anonymous();
    expect((await visitor.get(`/api/exhibitions/${pub.id}`)).status).toBe(404);
    expect((await visitor.get(`/api/artworks/${artworkIds[0]}/image`)).status).toBe(404);
    expect((await visitor.get('/api/exhibitions')).body.items.map((i) => i.id)).not.toContain(pub.id);

    const studio = (await c.get(`/api/me/exhibitions/${pub.id}`)).body.exhibition;
    expect(studio.suspended).toBe(true);
    const draft = (await c.post(`/api/me/exhibitions/${pub.id}/unpublish`, undefined, studio.etag)).body.exhibition;
    const again = await c.post(`/api/me/exhibitions/${pub.id}/publish`, undefined, draft.etag);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('exhibition_suspended');

    await admin.post(`/api/admin/exhibitions/${pub.id}/unsuspend`);
    await publish(c, draft);
    expect((await visitor.get(`/api/exhibitions/${pub.id}`)).status).toBe(200);
  });
});

describe('suspension d’un compte (T25)', () => {
  it('coupe ses sessions, bloque la connexion et masque ses publications', async () => {
    const admin = await newAdmin();
    const c = await newUser();
    const { exhibition } = await readyExhibition(c, 1);
    const pub = await publish(c, exhibition);
    const found = await admin.get(`/api/admin/users?q=${c.user.username}`);
    expect(found.body.users).toEqual([expect.objectContaining({ id: c.user.id, exhibitionCount: 1, suspended: false })]);

    expect((await admin.post(`/api/admin/users/${c.user.id}/suspend`)).status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(401);
    const login = await (await anonymous()).login(c.user.username, PASSWORD);
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('account_suspended');
    expect((await (await anonymous()).get(`/api/exhibitions/${pub.id}`)).status).toBe(404);

    await admin.post(`/api/admin/users/${c.user.id}/unsuspend`);
    expect((await (await anonymous()).login(c.user.username, PASSWORD)).status).toBe(200);
    expect((await (await anonymous()).get(`/api/exhibitions/${pub.id}`)).status).toBe(200);
  });

  it('un administrateur ne peut pas se suspendre lui-même', async () => {
    const admin = await newAdmin();
    expect((await admin.post(`/api/admin/users/${admin.user.id}/suspend`)).status).toBe(400);
  });
});
