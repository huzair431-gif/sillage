import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { toMarkdown } from '@sillage/quiz-parser';
import type { QuestionInput } from '@sillage/shared';
const fixture: QuestionInput[] = Array.from({ length: 40 }, (_, i) => ({
  externalId: `e2e-${i}`,
  statement: `Comment retrouver la connaissance ${i + 1} ?`,
  type: 'SINGLE',
  notion: `Rappel ${(i % 4) + 1}`,
  difficulty: 'MEDIUM',
  options: [
    { text: `Réponse exacte ${i + 1}`, isCorrect: true },
    { text: `Distracteur ${i + 1}`, isCorrect: false },
  ],
  explanation: `L’explication complète de la connaissance ${i + 1}, avec la formule $S=${i + 1}$.`,
}));
async function login(page: Page) {
  const account = JSON.parse(await readFile('test-results/account.json', 'utf8'));
  await page.goto('/');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Mot de passe', { exact: false }).first().fill(account.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Camille.' })).toBeVisible();
}
test.describe.serial('parcours de bout en bout', () => {
  test('40 questions, correction visuelle, quiz, reprise, examen, remplacement et sauvegarde', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await login(page);
    await page.getByRole('button', { name: 'Nouvelle matière', exact: true }).click();
    await page.getByLabel('Nom de la matière', { exact: true }).fill('PC40 · Calcul parallèle');
    await page
      .getByLabel('Description (facultative)', { exact: true })
      .fill('Un cours pour apprendre et retenir.');
    await page.getByRole('button', { name: 'Créer la matière', exact: true }).click();
    await page.getByRole('heading', { name: 'PC40 · Calcul parallèle', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter un chapitre', exact: true }).first().click();
    await page.getByLabel('Titre du chapitre', { exact: true }).fill('Loi d’Amdahl');
    await page.getByRole('button', { name: 'Créer le chapitre', exact: true }).click();
    await page.getByRole('heading', { name: 'Loi d’Amdahl', exact: true }).click();
    await page.getByRole('link', { name: 'Ajouter des questions', exact: true }).first().click();
    await page
      .getByRole('textbox', { name: 'Questions en Markdown', exact: true })
      .fill(fixture.map(toMarkdown).join('\n'));
    await expect(page.getByText('40 questions détectées', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    const editor = page.getByRole('dialog');
    await editor
      .getByLabel('Explication', { exact: false })
      .fill('Correction validée dans l’éditeur visuel. La formule $S=1$ reste lisible.');
    await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    fixture[0]!.explanation =
      'Correction validée dans l’éditeur visuel. La formule $S=1$ reste lisible.';
    await expect(
      page.getByRole('button', { name: 'Prévisualiser l’importation', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Prévisualiser l’importation', exact: true }).click();
    await page.getByRole('button', { name: 'Importer les 40 questions', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Loi d’Amdahl', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Découvrir/ }).click();
    const started = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/quiz/sessions'),
    );
    await page.getByRole('button', { name: 'Commencer la session', exact: true }).click();
    const session = await (await started).json();
    const failedId = session.questions[0].questionId;
    for (let n = 0; n < 21; n++) {
      await expect(
        page.getByRole('button', { name: 'Valider ma réponse', exact: true }),
      ).toBeVisible();
      await page
        .locator('.quiz-option')
        .filter({ hasText: n === 0 ? /Distracteur/ : /Réponse exacte/ })
        .click();
      if (n === 1) await page.route('**/api/quiz/sessions/*/answers', (r) => r.abort('failed'));
      await page.getByRole('button', { name: 'Valider ma réponse', exact: true }).click();
      if (n === 1) {
        await expect(
          page.getByText('Votre réponse n’est pas encore confirmée.', { exact: true }),
        ).toBeVisible();
        await page.unroute('**/api/quiz/sessions/*/answers');
        await page.reload();
        await expect(
          page.getByText('Votre réponse n’est pas encore confirmée.', { exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Réessayer l’enregistrement', exact: true }).click();
      }
      if (n === 0) {
        const correction = page.getByRole('dialog');
        await expect(
          correction.getByRole('heading', { name: 'Réponse incorrecte', exact: true }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(correction).toBeVisible();
        await correction
          .getByRole('button', { name: 'J’ai compris, continuer', exact: true })
          .click();
      } else {
        await page
          .getByRole('button', {
            name: n === 20 ? 'Terminer la session' : 'Continuer',
            exact: true,
          })
          .click();
      }
    }
    await page.getByRole('button', { name: 'Voir mon bilan', exact: true }).click();
    await expect(page.locator('.score-ring')).toContainText('95');
    await page.getByRole('link', { name: 'Consulter ma progression', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ma progression', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible();
    await login(page);
    await expect(
      page.getByRole('heading', { name: 'PC40 · Calcul parallèle', exact: true }),
    ).toBeVisible();
    await page.getByRole('heading', { name: 'PC40 · Calcul parallèle', exact: true }).click();
    await page.getByRole('heading', { name: 'Loi d’Amdahl', exact: true }).click();
    await page.getByRole('button', { name: /^Réviser Ancrer/ }).click();
    const revisionStarted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/api/quiz/sessions'),
    );
    await page.getByRole('button', { name: 'Commencer la session', exact: true }).click();
    const revision = await (await revisionStarted).json();
    expect(revision.questions.some((q: { questionId: string }) => q.questionId === failedId)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Mettre en pause', exact: false }).click();
    await page.getByRole('button', { name: /^Examen/ }).click();
    await page.getByRole('button', { name: '10', exact: true }).click();
    await page.getByRole('button', { name: 'Commencer la session', exact: true }).click();
    await page
      .locator('.quiz-option')
      .filter({ hasText: /Réponse exacte/ })
      .click();
    const answered = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/answers'),
    );
    await page.getByRole('button', { name: 'Valider ma réponse', exact: true }).click();
    const intermediate = await (await answered).json();
    expect(JSON.stringify(intermediate)).not.toContain('isCorrect');
    expect(JSON.stringify(intermediate)).not.toContain('explanation');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();
    await page.getByRole('button', { name: 'Terminer et voir le bilan', exact: true }).click();
    await expect(page.locator('.score-ring')).toContainText('10');
    await page.getByRole('link', { name: 'Retour au chapitre', exact: true }).click();
    await page.getByRole('button', { name: 'Actions du lot', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remplacer le lot', exact: true }).click();
    const changed = fixture.map((q, i) =>
      i === 0 ? { ...q, statement: q.statement + ' Version enrichie.' } : q,
    );
    await page
      .getByRole('textbox', { name: 'Questions en Markdown', exact: true })
      .fill(changed.map(toMarkdown).join('\n'));
    await expect(
      page.getByRole('button', { name: 'Prévisualiser l’importation', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Prévisualiser l’importation', exact: true }).click();
    await expect(page.locator('.diff-summary')).toContainText('39');
    await page.getByLabel('Je confirme le remplacement', { exact: false }).check();
    await page.getByRole('button', { name: 'Confirmer le remplacement', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Loi d’Amdahl', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données', exact: true }).click();
    const backup = await download;
    const path = resolve('test-results/sillage-export.json');
    await backup.saveAs(path);
    const exported = JSON.parse(await readFile(path, 'utf8'));
    expect(exported.questions).toHaveLength(40);
    expect(exported.attempts.length).toBeGreaterThan(20);
    await page.locator('input[type=file]').setInputFiles(path);
    await page
      .getByLabel('Saisissez REMPLACER MES DONNÉES pour confirmer', { exact: true })
      .fill('REMPLACER MES DONNÉES');
    await page.getByRole('button', { name: 'Restaurer et remplacer', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Vue d’ensemble', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'PC40 · Calcul parallèle', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
  test('360, 390, 768, 1024, 1440 px, navigation clavier, thèmes et absence de débordement', async ({
    page,
  }) => {
    await login(page);
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole('heading', { name: 'Bonjour Camille.' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    const nav = page.getByRole('dialog');
    await nav.getByRole('link', { name: 'Paramètres', exact: true }).click();
    await page.getByRole('button', { name: 'Sombre', exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer mes préférences', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Clair', exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer mes préférences', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Mes matières', exact: true }).click();
    await page.getByRole('heading', { name: 'PC40 · Calcul parallèle', exact: true }).click();
    await page.getByRole('heading', { name: 'Loi d’Amdahl', exact: true }).click();
    await page.getByRole('link', { name: 'Ajouter des questions', exact: true }).first().click();
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(
        page.getByRole('textbox', { name: 'Questions en Markdown', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.getByRole('button', { name: 'Quitter l’importation', exact: true }).click();
    await page.getByRole('button', { name: /^Réviser Ancrer/ }).click();
    await page.getByRole('button', { name: 'Commencer la session', exact: true }).click();
    await expect(page.locator('.quiz-option').first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/quiz-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Mettre en pause', exact: false }).click();
  });
});
