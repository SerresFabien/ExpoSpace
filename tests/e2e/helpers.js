// Outils des tests E2E.
import { randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';
import { DEMO_ARTWORKS, demoImage } from '../../scripts/lib/demoImages.mjs';

export const PASSWORD = 'phrase de passe de test e2e';

export const uniqueName = (prefix = 'e2e') => `${prefix}_${randomBytes(5).toString('hex')}`;

export async function imageFile(index) {
  return { name: `oeuvre-${index}.jpg`, mimeType: 'image/jpeg', buffer: await demoImage(index) };
}

export class ApiClient {
  constructor(request) {
    this.request = request;
    this.csrf = null;
  }

  async init() {
    const res = await this.request.get('/api/auth/csrf');
    this.csrf = (await res.json()).csrfToken;
    return this;
  }

  async call(method, url, { data, etag, multipart } = {}) {
    const headers = { 'X-CSRF-Token': this.csrf };
    if (etag) headers['If-Match'] = etag;
    const res = await this.request.fetch(url, { method, headers, data, multipart });
    const body = res.status() === 204 ? null : await res.json();
    if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${JSON.stringify(body)}`);
    return body;
  }

  async register(username = uniqueName()) {
    const body = await this.call('POST', '/api/auth/register', { data: { username, displayName: `Créateur ${username.slice(-4)}`, password: PASSWORD } });
    this.csrf = body.csrfToken;
    return body.user;
  }

  async exhibition({ n = 3, place = true, publish = false, title = 'Exposition E2E' } = {}) {
    let ex = (await this.call('POST', '/api/me/exhibitions', { data: { title } })).exhibition;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const meta = DEMO_ARTWORKS[i % DEMO_ARTWORKS.length];
      const file = await imageFile(i);
      const res = await this.call('POST', `/api/me/exhibitions/${ex.id}/artworks`, {
        etag: ex.etag,
        multipart: { rightsConfirmed: 'true', title: meta.title, altText: meta.altText, artistName: meta.artistName, image: file },
      });
      ex = res.exhibition;
      ids.push(res.artworkId);
    }
    if (place) {
      const slots = ['N1', 'N2', 'N3', 'E1', 'E2', 'E3'];
      const placements = ids.map((artworkId, i) => ({ roomId: ex.rooms[0].id, artworkId, slotCode: slots[i] }));
      ex = (await this.call('PUT', `/api/me/exhibitions/${ex.id}/placements`, { etag: ex.etag, data: { placements } })).exhibition;
      ex = (await this.call('PATCH', `/api/me/exhibitions/${ex.id}`, { etag: ex.etag, data: { coverArtworkId: ids[0] } })).exhibition;
    }
    if (publish) ex = (await this.call('POST', `/api/me/exhibitions/${ex.id}/publish`, { etag: ex.etag })).exhibition;
    return { exhibition: ex, artworkIds: ids };
  }
}

export async function cameraOf(page) {
  const value = await page.getByTestId('viewer-3d').getAttribute('data-camera');
  const [x, z, yaw] = (value ?? 'NaN,NaN,NaN').split(',').map(Number);
  return { x, z, yaw };
}

export async function holdKey(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
}

export async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
