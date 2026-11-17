import { expect, test } from '@playwright/test';
import { HOSTING_LINK } from '../../packages/shared/src/hosting.js';
import { ApiClient } from './helpers.js';

const isExternal = Boolean(process.env.E2E_BASE_URL);

async function expectLinkInViewport(page) {
  const link = page.getByRole('link', { name: 'Ce site tourne chez By-Hoster' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://by-hoster.net/web-hosting?ref=etu-6a89d7cc9f');
  await expect(link).toHaveAttribute('title', 'Site hébergé par By-Hoster');
  const fontSize = await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(13);
  return link;
}

async function publishedExhibitionId(page) {
  const catalog = await (await page.request.get('/api/exhibitions')).json();
  if (catalog.items.length) return catalog.items[0].id;
  if (isExternal) return null;
  const api = await new ApiClient(page.request).init();
  await api.register();
  return (await api.exhibition({ n: 2, publish: true, title: 'Exposition pied de page' })).exhibition.id;
}

test('@lecture-seule le lien By-Hoster exact est dans le HTML brut de l’accueil, sans JavaScript (T31)', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(HOSTING_LINK);
  expect(html.split(HOSTING_LINK)).toHaveLength(2);
});

test('@lecture-seule le lien est visible et lisible sur ordinateur et sur mobile (T32)', async ({ page }) => {
  await page.goto('/');
  const link = await expectLinkInViewport(page);
  await link.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/inscription');
  await expectLinkInViewport(page);
});

test('@lecture-seule le pied de page reste visible pendant la visite 3D, sans défilement (T32)', async ({ page }) => {
  const id = await publishedExhibitionId(page);
  test.skip(!id, 'Aucune exposition publiée sur ce site pour l’instant.');
  await page.goto(`/expositions/${id}/visite`);
  await expect(page.getByTestId('viewer-3d')).toBeVisible();
  const link = await expectLinkInViewport(page);
  const box = await link.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('@lecture-seule les URL de l’application se rechargent directement ; /api ne renvoie jamais la page (T30)', async ({ page, request }) => {
  for (const path of ['/connexion', '/inscription', '/recuperation']) {
    const res = await page.goto(path);
    expect(res.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  }
  const id = await publishedExhibitionId(page);
  if (id) {
    await page.goto(`/expositions/${id}`);
    await expect(page.getByRole('link', { name: 'Visiter en 3D' })).toBeVisible();
  }
  const api404 = await request.get('/api/route-inexistante');
  expect(api404.status()).toBe(404);
  expect(api404.headers()['content-type']).toContain('application/json');
  const health = await (await request.get('/api/health')).json();
  expect(health.ok).toBe(true);
});

test('@lecture-seule le temps réel passe : deux visiteurs se comptent dans la même salle (T35)', async ({ page, browser }) => {
  const id = await publishedExhibitionId(page);
  test.skip(!id, 'Aucune exposition publiée sur ce site pour l’instant.');
  const other = await (await browser.newContext()).newPage();
  await page.goto(`/expositions/${id}/visite`);
  await expect(page.getByTestId('presence')).toHaveText(/dans cette salle$/, { timeout: 15_000 });
  await other.goto(`/expositions/${id}/visite`);
  await expect(page.getByTestId('presence')).toHaveText(/^\d+ visiteurs dans cette salle$/);
  await expect(other.getByTestId('presence')).toHaveText(/^\d+ visiteurs dans cette salle$/);
  await other.context().close();
});
