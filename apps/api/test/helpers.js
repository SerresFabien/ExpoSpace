// Outils des tests d'intégration.
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

export const PASSWORD = 'mot-de-passe-de-test-solide';

export function uniqueUsername(prefix = 'u') {
  return `${prefix}_${randomBytes(6).toString('hex')}`.slice(0, 30);
}

export class Client {
  constructor() {
    this.agent = request.agent(app);
    this.csrf = null;
    this.user = null;
  }

  async init() {
    const res = await this.agent.get('/api/auth/csrf');
    this.csrf = res.body.csrfToken;
    return this;
  }

  get(url) {
    return this.agent.get(url);
  }

  #write(method, url, { body, etag } = {}) {
    let req = this.agent[method](url).set('X-CSRF-Token', this.csrf ?? '');
    if (etag) req = req.set('If-Match', etag);
    return body === undefined ? req : req.send(body);
  }

  post(url, body, etag) {
    return this.#write('post', url, { body, etag });
  }

  patch(url, body, etag) {
    return this.#write('patch', url, { body, etag });
  }

  put(url, body, etag) {
    return this.#write('put', url, { body, etag });
  }

  delete(url, etag) {
    return this.#write('delete', url, { etag });
  }

  upload(exhibitionId, etag, buffer, { filename = 'image.jpg', fields = {}, rights = true } = {}) {
    let req = this.agent.post(`/api/me/exhibitions/${exhibitionId}/artworks`).set('X-CSRF-Token', this.csrf ?? '');
    if (etag) req = req.set('If-Match', etag);
    if (rights) req = req.field('rightsConfirmed', 'true');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('image', buffer, filename);
  }

  async register({ username = uniqueUsername(), displayName = 'Testeur', password = PASSWORD } = {}) {
    if (!this.csrf) await this.init();
    const res = await this.post('/api/auth/register', { username, displayName, password });
    if (res.status !== 201) throw new Error(`Inscription impossible : ${res.status} ${JSON.stringify(res.body)}`);
    this.csrf = res.body.csrfToken;
    this.user = res.body.user;
    this.password = password;
    this.recoveryCode = res.body.recoveryCode;
    return res;
  }

  async login(username, password) {
    if (!this.csrf) await this.init();
    const res = await this.post('/api/auth/login', { username, password });
    if (res.status === 200) {
      this.csrf = res.body.csrfToken;
      this.user = res.body.user;
    }
    return res;
  }

  async createExhibition(title = 'Exposition de test') {
    const res = await this.post('/api/me/exhibitions', { title, description: 'Une description.' });
    if (res.status !== 201) throw new Error(`Création impossible : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.exhibition;
  }

  async addArtwork(exhibition, { width = 800, height = 600, fields = { title: 'Œuvre', altText: 'Description de l’image' } } = {}) {
    const res = await this.upload(exhibition.id, exhibition.etag, await jpeg(width, height), { fields });
    if (res.status !== 201) throw new Error(`Import impossible : ${res.status} ${JSON.stringify(res.body)}`);
    return { exhibition: res.body.exhibition, artworkId: res.body.artworkId };
  }
}

export async function newUser() {
  const client = await new Client().init();
  await client.register();
  return client;
}

export const anonymous = () => new Client().init();

export function jpeg(width = 800, height = 600) {
  const background = { r: randomBytes(1)[0], g: 120, b: 200 };
  return sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 80 }).toBuffer();
}

export function png(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
}

export async function readyExhibition(client, n = 3) {
  let exhibition = await client.createExhibition();
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = await client.addArtwork(exhibition, { fields: { title: `Œuvre ${i + 1}`, altText: `Texte alternatif ${i + 1}` } });
    exhibition = r.exhibition;
    ids.push(r.artworkId);
  }
  const room = exhibition.rooms[0];
  const slots = ['N1', 'N2', 'N3', 'E1', 'E2', 'E3'];
  let res = await client.put(`/api/me/exhibitions/${exhibition.id}/placements`, { placements: ids.map((artworkId, i) => ({ roomId: room.id, artworkId, slotCode: slots[i] })) }, exhibition.etag);
  if (res.status !== 200) throw new Error(`Placement impossible : ${JSON.stringify(res.body)}`);
  exhibition = res.body.exhibition;
  res = await client.patch(`/api/me/exhibitions/${exhibition.id}`, { coverArtworkId: ids[0] }, exhibition.etag);
  if (res.status !== 200) throw new Error(`Couverture impossible : ${JSON.stringify(res.body)}`);
  return { exhibition: res.body.exhibition, artworkIds: ids };
}

export async function publish(client, exhibition) {
  const res = await client.post(`/api/me/exhibitions/${exhibition.id}/publish`, undefined, exhibition.etag);
  if (res.status !== 200) throw new Error(`Publication impossible : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.exhibition;
}
