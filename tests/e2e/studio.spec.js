import { expect, test } from '@playwright/test';
import { ApiClient, cameraOf, uniqueName } from './helpers.js';

async function placeDoorAt(page, slot, target) {
  await page.getByRole('button', { name: new RegExp(`^Place ${slot},`) }).click();
  await page.locator('.slot-panel').getByText('Une porte', { exact: true }).click();
  await page.getByLabel('Elle mène à').selectOption({ label: target });
  await page.getByRole('button', { name: 'Placer ici' }).click();
}

async function placeAt(page, slot, title) {
  await page.getByRole('button', { name: new RegExp(`^Place ${slot},`) }).click();
  await page.locator('.slot-panel').getByText(title, { exact: true }).click();
  await page.getByRole('button', { name: 'Placer ici' }).click();
}

test('un onglet ancien reçoit un conflit et garde ses changements à l’écran (T11)', async ({ context }) => {
  const tab1 = await context.newPage();
  const api = await new ApiClient(tab1.request).init();
  await api.register();
  const { exhibition } = await api.exhibition({ n: 2, place: false });
  const tab2 = await context.newPage();
  for (const tab of [tab1, tab2]) await tab.goto(`/studio/${exhibition.id}?onglet=salle`);

  await placeAt(tab1, 'N1', 'Reflets');
  await tab1.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(tab1.getByText('Enregistré ✓')).toBeVisible();

  await placeAt(tab2, 'N3', 'Fenêtre nord');
  await tab2.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(tab2.getByText('Cette exposition a été modifiée ailleurs', { exact: true })).toBeVisible();
  await expect(tab2.getByText('Échec de l’enregistrement')).toBeVisible();
  await expect(tab2.getByRole('button', { name: /^Place N3, .* : Fenêtre nord$/ })).toBeVisible();

  await tab2.getByRole('button', { name: 'Recharger la dernière version' }).click();
  await expect(tab2.getByRole('button', { name: /^Place N1, .* : Reflets$/ })).toBeVisible();
  await expect(tab2.getByRole('button', { name: /^Place N3, .* : libre$/ })).toBeVisible();
});

test('prévient avant de quitter le studio avec une disposition non enregistrée', async ({ page }) => {
  const api = await new ApiClient(page.request).init();
  await api.register();
  const { exhibition } = await api.exhibition({ n: 1, place: false });
  await page.goto(`/studio/${exhibition.id}?onglet=salle`);
  await placeAt(page, 'E2', 'Reflets');
  await page.getByRole('link', { name: '← Mes expositions' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Quitter sans enregistrer ?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/${exhibition.id}`));
  await expect(page.getByRole('button', { name: /^Place E2, .* : Reflets$/ })).toBeVisible();
});

test('deux salles reliées par des portes : accrochage, publication, passage de la porte et recherche (T22)', async ({ page, browser }) => {
  const api = await new ApiClient(page.request).init();
  await api.register();
  const title = `Deux salles ${uniqueName('expo')}`;
  const { exhibition } = await api.exhibition({ n: 2, place: false, title });
  await page.goto(`/studio/${exhibition.id}?onglet=salle`);

  await placeAt(page, 'N1', 'Reflets');
  await expect(page.getByRole('button', { name: 'Ajouter une salle' })).toBeDisabled();
  await expect(page.getByText('Enregistrez d’abord la disposition')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(page.getByText('Enregistré ✓')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une salle' }).click();
  await expect(page.getByLabel('Salle affichée').locator('option:checked')).toHaveText('Salle 2 - Salle 2');
  await expect(page.getByText('« Salle 2 » ajoutée.')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Portes de « Salle 2 »' })).toContainText('aucune pour l’instant');

  // Salle 2 : une œuvre et une porte.
  await placeAt(page, 'N1', 'Fenêtre nord');
  await placeDoorAt(page, 'S2', 'Salle 1 - Salle 1');
  await expect(page.getByRole('button', { name: 'Place S2, mur sud : porte vers Salle 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une salle' })).toBeDisabled();
  await page.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(page.getByText('Enregistré ✓')).toBeVisible();

  // Marque « modifié » et message de publication.
  await page.getByLabel('Nom de la salle').fill('Annexe');
  await expect(page.getByRole('tab', { name: 'Salle et accrochage •' })).toBeVisible();
  await page.getByRole('tab', { name: /Publication/ }).click();
  await expect(page.getByText('Des modifications ne sont pas enregistrées dans l’onglet « Salle et accrochage »')).toBeVisible();
  await page.getByRole('tab', { name: /Salle et accrochage/ }).click();
  await page.getByRole('button', { name: 'Enregistrer la salle' }).click();
  await expect(page.getByText('Salle enregistrée.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Salle et accrochage', exact: true })).toBeVisible();

  // Salle inaccessible : publication refusée.
  await page.getByRole('tab', { name: /Publication/ }).click();
  await expect(page.getByText('Aucune porte ne mène à « Annexe » depuis « Salle 1 »')).toBeVisible();
  await page.getByRole('tab', { name: /Salle et accrochage/ }).click();
  await page.getByLabel('Salle affichée').selectOption({ label: 'Salle 1 - Salle 1' });
  await placeDoorAt(page, 'N2', 'Salle 2 - Annexe');
  await expect(page.getByRole('button', { name: 'Place N2, mur nord : porte vers Annexe' })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer la disposition' }).click();
  await expect(page.getByText('Enregistré ✓')).toBeVisible();

  await page.getByRole('tab', { name: /Informations/ }).click();
  await page.locator('#panel-infos').getByText('Reflets', { exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer les informations' }).click();
  await expect(page.locator('#panel-infos').getByText('Enregistré ✓')).toBeVisible();
  await page.getByRole('tab', { name: /Publication/ }).click();
  await page.getByRole('button', { name: 'Publier l’exposition' }).click();
  await expect(page.getByRole('heading', { name: 'Exposition publiée' })).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  await visitor.getByLabel('Rechercher par titre').fill(title.toUpperCase());
  await visitor.getByRole('button', { name: 'Rechercher' }).click();
  await expect(visitor.getByText('1 exposition trouvée')).toBeVisible();
  await visitor.getByRole('link', { name: title }).click();
  await visitor.getByRole('link', { name: 'Visiter en 3D' }).click();
  await expect(visitor.getByText('Salle 1/2 - Salle 1')).toBeVisible();
  await visitor.getByRole('button', { name: 'Compris' }).click();
  await expect.poll(async () => (await cameraOf(visitor)).z).toBeCloseTo(2, 1);

  // Clic sur la porte N2, face à l'entrée.
  const viewer = visitor.getByTestId('viewer-3d');
  const box = await viewer.boundingBox();
  await visitor.mouse.click(box.x + box.width / 2, box.y + box.height * 0.56);
  await expect(visitor.getByText('Salle 2/2 - Annexe')).toBeVisible();
  await expect(visitor.locator('dialog[open]')).toHaveCount(0);
  // Arrivée devant la porte S2.
  await expect.poll(async () => (await cameraOf(visitor)).z).toBeCloseTo(3.56, 1);

  await visitor.getByRole('button', { name: 'Salle précédente' }).click();
  await expect(visitor.getByText('Salle 1/2 - Salle 1')).toBeVisible();
  await expect.poll(async () => (await cameraOf(visitor)).z).toBeCloseTo(-3.56, 1);
});
