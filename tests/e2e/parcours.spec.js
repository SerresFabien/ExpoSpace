import { expect, test } from '@playwright/test';
import { PASSWORD, cameraOf, holdKey, imageFile, uniqueName } from './helpers.js';

const TITLES = ['Reflets', 'Fenêtre nord', 'Quartier lumière'];

test('une créatrice publie son exposition, un visiteur anonyme la parcourt en 3D et en 2D', async ({ page, browser }) => {
  await page.goto('/inscription');
  const username = uniqueName('camille');
  await page.getByLabel('Identifiant de connexion').fill(username);
  await page.getByLabel('Nom affiché').fill('Camille E2E');
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmer le mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByTestId('recovery-code')).toHaveText(/^([0-9A-Z]{5}-){5}[0-9A-Z]{5}$/);
  const continueButton = page.getByRole('button', { name: 'Accéder à mes expositions' });
  await expect(continueButton).toBeDisabled();
  await page.getByLabel('J’ai conservé ce code en lieu sûr.').check();
  await continueButton.click();

  const title = `Lumières ${uniqueName('expo')}`;
  await page.getByLabel('Titre').fill(title);
  await page.getByRole('button', { name: 'Créer l’exposition' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await page.getByLabel('Je déclare disposer des droits nécessaires pour diffuser ces images.').check();
  await page.locator('input[type=file]').setInputFiles([await imageFile(0), await imageFile(1), await imageFile(2)]);
  await expect(page.locator('.upload-done')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator('.artwork-card')).toHaveCount(3);

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Modifier la fiche' }).nth(i).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Titre (obligatoire pour publier)').fill(TITLES[i]);
    await dialog.getByLabel('Texte alternatif (obligatoire pour publier)').fill(`Composition abstraite numéro ${i + 1}`);
    await dialog.getByRole('button', { name: 'Enregistrer la fiche' }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.locator('.badge-warning')).toHaveCount(0);

  await page.getByRole('tab', { name: /Salle et accrochage/ }).click();
  const slots = ['N2', 'E2', 'W2'];
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: new RegExp(`^Place ${slots[i]},`) }).click();
    await page.locator('.slot-panel').getByText(TITLES[i], { exact: true }).click();
    await page.getByRole('button', { name: 'Placer ici' }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Modifications non enregistrées' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(page.getByText('Enregistré ✓')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /Salle et accrochage/ }).click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('button', { name: new RegExp(`^Place ${slots[i]}, .* : ${TITLES[i]}$`) })).toBeVisible();
  }

  await page.getByRole('tab', { name: /Informations/ }).click();
  await page.locator('#panel-infos').getByText('Reflets', { exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
  await expect(page.locator('#panel-infos').getByText('Enregistré ✓')).toBeVisible();
  await page.getByRole('tab', { name: /Publication/ }).click();
  await expect(page.getByText('Tout est prêt')).toBeVisible();
  await page.getByRole('button', { name: 'Publier l’exposition' }).click();
  await expect(page.getByRole('heading', { name: 'Exposition publiée' })).toBeVisible();
  const exhibitionId = new URL(page.url()).pathname.split('/')[2];

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  await visitor.getByRole('link', { name: title }).click();
  await expect(visitor.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await visitor.getByRole('link', { name: 'Visiter en 3D' }).click();
  await expect(visitor.getByTestId('viewer-3d')).toBeVisible();
  await expect.poll(async () => (await cameraOf(visitor)).z).toBeCloseTo(2, 1);
  await visitor.getByRole('button', { name: 'Compris' }).click();

  await holdKey(visitor, 'ArrowUp', 7000);
  let cam = await cameraOf(visitor);
  expect(cam.z).toBeLessThan(0);
  expect(cam.z).toBeGreaterThanOrEqual(-4.7);
  await holdKey(visitor, 'ArrowDown', 9000);
  cam = await cameraOf(visitor);
  expect(cam.z).toBeLessThanOrEqual(4.7);
  expect(cam.z).toBeGreaterThan(2);
  await visitor.getByRole('button', { name: 'Recentrer' }).click();
  await expect.poll(async () => cameraOf(visitor)).toEqual({ x: 0, z: 2, yaw: 0 });

  await visitor.getByRole('button', { name: 'Œuvre suivante ▶' }).click();
  await visitor.getByRole('button', { name: 'Voir la fiche' }).click();
  const sheet = visitor.locator('dialog[open]');
  await expect(sheet.getByRole('heading', { name: 'Reflets' })).toBeVisible();
  await expect.poll(() => sheet.locator('img').evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await visitor.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await visitor.goto(`/expositions/${exhibitionId}/galerie`);
  const first = visitor.getByRole('button', { name: /Reflets/ });
  await first.focus();
  await visitor.keyboard.press('Enter');
  await expect(visitor.locator('dialog[open]')).toBeVisible();
  await visitor.keyboard.press('Escape');
  await expect(first).toBeFocused();
  for (const t of TITLES) await expect(visitor.getByRole('button', { name: new RegExp(t) })).toBeVisible();
});
