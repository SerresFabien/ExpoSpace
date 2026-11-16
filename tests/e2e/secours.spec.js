import { expect, test } from '@playwright/test';
import { ApiClient, expectNoHorizontalScroll } from './helpers.js';

let published;
let draft;

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const api = await new ApiClient(page.request).init();
  await api.register();
  published = (await api.exhibition({ n: 3, publish: true, title: 'Exposition de secours' })).exhibition;
  draft = (await api.exhibition({ n: 1, title: 'Brouillon confidentiel' })).exhibition;
  await page.context().close();
});

// WebSocket refusé par l'hébergeur.
function refuseWebSockets() {
  window.WebSocket = class extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      setTimeout(() => {
        this.readyState = 3;
        this.onerror?.(new Event('error'));
        this.onclose?.({ code: 1006, reason: '' });
      }, 50);
    }
    send() {}
    close() {}
  };
}

test('WebSocket bloqué par l’hébergeur : présence et discussion passent par HTTP (T38)', async ({ page }) => {
  await page.addInitScript(refuseWebSockets);
  await page.goto(`/expositions/${published.id}/visite`);
  await expect(page.getByTestId('presence')).toHaveText('Vous êtes la seule personne dans cette salle');
  await page.waitForTimeout(1500);
  await expect(page.getByText('Discussion indisponible')).toHaveCount(0);
});

test('temps réel entièrement indisponible : la visite fonctionne quand même (T38)', async ({ page }) => {
  await page.addInitScript(refuseWebSockets);
  await page.route(/\/api\/realtime\//, (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }));
  await page.goto(`/expositions/${published.id}/visite`);
  await expect(page.getByText('Discussion indisponible')).toBeVisible();
  await expect(page.getByTestId('viewer-3d')).toBeVisible();
  await page.getByRole('button', { name: 'Compris' }).click();
  await page.getByRole('button', { name: 'Œuvre suivante ▶' }).click();
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Œuvre 1 sur 3' })).toHaveCount(1);
});

test('sans WebGL, la visite propose la galerie 2D au lieu d’une page noire (T21)', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await page.goto(`/expositions/${published.id}`);
  await expect(page.getByText('La visite 3D n’est pas disponible sur cet appareil')).toBeVisible();
  await page.goto(`/expositions/${published.id}/visite`);
  await expect(page.getByRole('heading', { name: 'La visite 3D n’est pas disponible' })).toBeVisible();
  await page.getByRole('link', { name: 'Voir les œuvres en galerie 2D' }).click();
  await expect(page.getByRole('button', { name: /Reflets/ })).toBeVisible();
});

test('catalogue, fiche et galerie restent utilisables sur 320 px de large', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/', `/expositions/${published.id}`, `/expositions/${published.id}/galerie`, '/inscription']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test('un brouillon n’est jamais visible publiquement, même avec son lien (T05, T14)', async ({ page }) => {
  await page.goto(`/expositions/${draft.id}`);
  await expect(page.getByRole('heading', { name: 'Exposition indisponible' })).toBeVisible();
  await expect(page.getByText('Brouillon confidentiel')).toHaveCount(0);
  const image = await page.request.get(`/api/artworks/${draft.coverArtworkId ?? draft.artworks[0].id}/image`);
  expect(image.status()).toBe(404);
});
