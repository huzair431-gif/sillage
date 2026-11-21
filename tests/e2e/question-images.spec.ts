import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { QuizSession } from '@sillage/shared';

test('importe une image, la retrouve après rechargement et la consulte pendant le quiz', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const account = JSON.parse(await readFile('test-results/account.json', 'utf8'));
  const alt = 'Schéma comportant les repères A et B';
  await page.goto('/');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle matière', exact: true }).click();
  await page.getByLabel('Nom de la matière', { exact: true }).fill('Questions illustrées');
  await page.getByRole('button', { name: 'Créer la matière', exact: true }).click();
  await page.getByRole('heading', { name: 'Questions illustrées', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un chapitre', exact: true }).first().click();
  await page.getByLabel('Titre du chapitre', { exact: true }).fill('Repères visuels');
  await page.getByRole('button', { name: 'Créer le chapitre', exact: true }).click();
  await page.getByRole('heading', { name: 'Repères visuels', exact: true }).click();
  await page.getByRole('link', { name: 'Ajouter des questions', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Créer manuellement' }).click();
  await page
    .getByLabel('Énoncé', { exact: true })
    .fill('Quel repère représente le point de départ ?');
  await page.getByLabel('Texte de la proposition 1').fill('Le repère A');
  await page.getByLabel('Texte de la proposition 2').fill('Le repère B');
  await page
    .getByLabel('Explication', { exact: true })
    .fill('Le repère A est le point de départ du schéma.');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f5f4fb';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#5551a4';
    context.lineWidth = 14;
    context.beginPath();
    context.moveTo(550, 720);
    context.lineTo(1850, 720);
    context.stroke();
    for (const [x, label] of [
      [550, 'A'],
      [1850, 'B'],
    ] as const) {
      context.fillStyle = '#5551a4';
      context.beginPath();
      context.arc(x, 720, 130, 0, 2 * Math.PI);
      context.fill();
      context.fillStyle = '#fff';
      context.font = 'bold 100px sans-serif';
      context.textAlign = 'center';
      context.fillText(label, x, 755);
    }
    context.fillStyle = '#20232a';
    context.font = '70px sans-serif';
    context.fillText('Deux repères pour se situer', 1200, 300);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Choisir une image pour la question').setInputFiles({
    name: 'schema.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByLabel('Description de l’image').fill(alt);
  await expect(page.getByRole('img', { name: alt })).toBeVisible();
  await page.screenshot({ path: 'test-results/question-image-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('1 question détectée', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: alt })).toBeVisible();
  await page.getByRole('tab', { name: 'Créer manuellement' }).click();
  await page.getByLabel('Énoncé', { exact: true }).fill('Cette question ne possède pas d’image.');
  await page.getByLabel('Texte de la proposition 1').fill('Le repère A');
  await page.getByLabel('Texte de la proposition 2').fill('Le repère B');
  await page
    .getByLabel('Explication', { exact: true })
    .fill('Une question textuelle reste disponible.');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('2 questions détectées', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prévisualiser l’importation', exact: true }).click();
  await page.getByRole('button', { name: 'Importer les 2 questions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repères visuels', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Actions pour la question 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Modifier', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: alt })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: /^Découvrir/ }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/quiz/sessions') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Commencer la session', exact: true }).click();
  const session = (await (await created).json()) as QuizSession;
  expect(session.questions.filter((question) => question.image)).toHaveLength(1);
  const imagePosition = session.questions.findIndex((question) => question.image);
  for (let index = 0; index < imagePosition; index++) {
    await page.locator('.quiz-option').filter({ hasText: 'Le repère A' }).click();
    await page.getByRole('button', { name: 'Valider ma réponse', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  }
  await expect(page.getByRole('img', { name: alt })).toBeVisible();
  expect(await page.getByRole('img', { name: alt }).getAttribute('src')).toMatch(
    /^data:image\/webp;base64,/,
  );
  await page.screenshot({ path: 'test-results/question-image-quiz.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Agrandir l’image de la question' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: alt })).toBeVisible();
  const remaining = await page.locator('.question-timer strong').textContent();
  let answers = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/answers')) answers++;
  });
  await page.waitForTimeout(11000);
  expect(await page.locator('.question-timer strong').textContent()).toBe(remaining);
  expect(answers).toBe(0);
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.locator('.quiz-option').filter({ hasText: 'Le repère B' }).click();
  await page.getByRole('button', { name: 'Valider ma réponse', exact: true }).click();
  const correction = page.getByRole('dialog');
  await expect(correction.getByRole('heading', { name: 'Réponse incorrecte' })).toBeVisible();
  await expect(correction.getByRole('img', { name: alt })).toBeVisible();
  await page.screenshot({
    path: 'test-results/question-image-correction-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
