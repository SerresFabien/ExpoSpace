import { expect, test } from '@playwright/test';
import { ApiClient, uniqueName } from './helpers.js';

test('deux visiteurs se voient dans la salle ; un compte connecté écrit, l’anonyme lit (T35, T36)', async ({ browser }) => {
  const writerContext = await browser.newContext();
  const writer = await writerContext.newPage();
  const api = await new ApiClient(writer.request).init();
  await api.register();
  const title = `Salle partagée ${uniqueName('expo')}`;
  const { exhibition } = await api.exhibition({ n: 1, publish: true, title });

  const reader = await (await browser.newContext()).newPage();
  await reader.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(reader.locator('.card').filter({ hasText: title })).toContainText('0 personne en visite');
  await reader.goto(`/expositions/${exhibition.id}/visite`);
  await expect(reader.getByTestId('presence')).toHaveText('Vous êtes la seule personne dans cette salle');

  await writer.goto(`/expositions/${exhibition.id}/visite`);
  await expect(writer.getByTestId('presence')).toHaveText('2 visiteurs dans cette salle');
  await expect(reader.getByTestId('presence')).toHaveText('2 visiteurs dans cette salle');

  const home = await (await browser.newContext()).newPage();
  await home.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(home.locator('.card').filter({ hasText: title })).toContainText('2 personnes en visite');
  await home.context().close();

  await reader.getByRole('button', { name: /^Discussion/ }).click();
  await expect(reader.getByRole('link', { name: 'Connectez-vous' })).toBeVisible();
  await expect(reader.getByLabel('Votre message')).toHaveCount(0);

  await writer.getByRole('button', { name: /^Discussion/ }).click();
  await writer.getByLabel('Votre message').fill('Bonjour depuis la salle');
  await writer.getByRole('button', { name: 'Envoyer' }).click();
  await expect(writer.getByLabel('Votre message')).toHaveValue('');
  await expect(reader.getByRole('list', { name: 'Messages de la salle' })).toContainText('Bonjour depuis la salle');

  // La saisie ne déplace pas la caméra.
  const before = await writer.getByTestId('viewer-3d').getAttribute('data-camera');
  await writer.getByLabel('Votre message').press('ArrowUp');
  await writer.getByLabel('Votre message').pressSequentially('zzzz');
  await writer.waitForTimeout(300);
  expect(await writer.getByTestId('viewer-3d').getAttribute('data-camera')).toBe(before);

  await writer.close();
  await expect(reader.getByTestId('presence')).toHaveText('Vous êtes la seule personne dans cette salle');
});
