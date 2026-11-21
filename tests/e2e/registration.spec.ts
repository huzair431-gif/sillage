import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const email = `signup-${randomUUID()}@test.invalid`;
const password = randomUUID() + '!A';

test.afterAll(async () => {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) return;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    await db.user.deleteMany({ where: { email } });
  } finally {
    await db.$disconnect();
  }
});

test('inscription immédiate, validation, doublon et reconnexion depuis le site', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Créez votre espace de révision.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Prénom ou nom')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/inscription-${width}.png`, fullPage: true });
  }
  await page.getByLabel('Prénom ou nom').fill('Camille');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password + 'différent');
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await expect(page.locator('.field-error')).toHaveText('Les mots de passe ne correspondent pas.');
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  expect((await registered).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Bonjour Camille.' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await page.getByLabel('Prénom ou nom').fill('Camille');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await expect(page.locator('.field-error')).toContainText('déjà utilisée');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Camille.' })).toBeVisible();
  expect(errors).toEqual([]);
});
