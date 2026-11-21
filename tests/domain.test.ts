import { describe, it, expect } from 'vitest';
import { parseQuestions, toMarkdown } from '@sillage/quiz-parser';
import {
  emptyMemory,
  review,
  selectQuestions,
  seeded,
  localDay,
  dateOnly,
} from '../apps/api/src/memory.js';
import { summarize } from '../apps/api/src/library.js';
import type { QuestionInput } from '@sillage/shared';
import { questionImageSchema, MAX_QUESTION_IMAGE_BYTES } from '@sillage/shared';
import { contentHash } from '../apps/api/src/imports.js';
import { questionImage } from './fixtures/question-image.js';
export const example: QuestionInput = {
  externalId: 'stable-001',
  statement: 'Quel est le rapport $T_s / T_p$ ?',
  type: 'SINGLE',
  notion: 'Speedup',
  difficulty: 'EASY',
  options: [
    { text: 'L’accélération', isCorrect: true },
    { text: 'La mémoire', isCorrect: false },
  ],
  explanation: 'Le rapport mesure l’accélération.\n\nUne explication sur plusieurs lignes.',
};
describe('parseur Markdown partagé', () => {
  it('conserve une image facultative et sa description dans un aller-retour Markdown', () => {
    const q = { ...example, image: { ...questionImage, alt: 'Repère [A] et barre \\ B' } };
    const parsed = parseQuestions(toMarkdown(q));
    expect(parsed.issues).toEqual([]);
    expect(parsed.questions[0]).toEqual(q);
  });
  it('refuse deux images pour une même question', () => {
    const text = toMarkdown({ ...example, image: questionImage }).replace(
      'Type:',
      `![Deuxième image](${questionImage.src})\n\nType:`,
    );
    expect(parseQuestions(text).issues.some((issue) => issue.message.includes('seule image'))).toBe(
      true,
    );
  });
  it('préserve les métadonnées, le LaTeX, Unicode et les explications multilignes', () => {
    const p = parseQuestions(toMarkdown(example));
    expect(p.issues).toEqual([]);
    expect(p.questions[0]).toEqual(example);
  });
  it('détecte le QCM simple, multiple et Vrai/Faux', () => {
    const txt =
      '## Simple\n- [x] A\n- [ ] B\n> Pourquoi A.\n\n## Multiple\n- [X] A\n- [x] B\n- [ ] C\n> Pourquoi A et B.\n\n## Booléenne\n- [x] Vrai\n- [ ] Faux\n> Pourquoi vrai.';
    expect(parseQuestions(txt).questions.map((q) => q.type)).toEqual([
      'SINGLE',
      'MULTIPLE',
      'TRUE_FALSE',
    ]);
  });
  it('ignore les titres dans les blocs de code, y compris dans les explications', () => {
    const q = {
      ...example,
      statement: 'Que fait ce code ?\n\n```markdown\n## Ceci n’est pas une autre question\n```',
      explanation: 'Un titre dans une chaîne.\n\n```markdown\n## Encore du code\n```',
    };
    const p = parseQuestions(toMarkdown(q));
    expect(p.entries).toHaveLength(1);
    expect(p.questions[0]).toEqual(q);
  });
  it('tolère CRLF, casse et espaces autour des métadonnées', () => {
    const p = parseQuestions(
      '## Titre\r\n\r\n notion : Test\r\n DIFFICULTÉ : difficile\r\n TYPE : QCM SIMPLE\r\n\r\n- [X] Oui\r\n- [ ] Non\r\n\r\n> Explication.',
    );
    expect(p.issues).toEqual([]);
    expect(p.questions[0]?.difficulty).toBe('HARD');
    expect(p.questions[0]?.notion).toBe('Test');
  });
  it.each([
    { name: 'sans explication', text: '## Q\n- [x] A\n- [ ] B' },
    { name: 'sans réponses', text: '## Q\n> Explication' },
    { name: 'sans bonne réponse', text: '## Q\n- [ ] A\n- [ ] B\n> Explication' },
    {
      name: 'mauvais type explicite',
      text: '## Q\nType: invente\n- [x] A\n- [ ] B\n> Explication',
    },
    {
      name: 'identifiants dupliqués',
      text: toMarkdown(example) + '\n' + toMarkdown({ ...example, statement: 'Différent' }),
    },
  ])('signale $name sans inventer de données', ({ text }) => {
    const p = parseQuestions(text);
    expect(p.issues.length).toBeGreaterThan(0);
    expect(p.issues[0]?.line).toBeGreaterThan(0);
  });
  it('signale précisément les doublons et les textes non structurés', () => {
    expect(
      parseQuestions(toMarkdown(example) + toMarkdown(example)).issues.some((x) =>
        x.message.includes('plusieurs'),
      ),
    ).toBe(true);
    expect(parseQuestions('Du texte sans titre').questions).toHaveLength(0);
  });
  it('importe mille questions sans modifier leurs identifiants', () => {
    const txt = Array.from({ length: 1000 }, (_, i) =>
      toMarkdown({ ...example, externalId: `bulk-${i}`, statement: `Question ${i}` }),
    ).join('\n');
    const p = parseQuestions(txt);
    expect(p.issues).toEqual([]);
    expect(p.questions).toHaveLength(1000);
    expect(p.questions[999]?.externalId).toBe('bulk-999');
  }, 30000);
});
describe('images des questions', () => {
  it('accepte une image intégrée et refuse les liens externes et les formats non pris en charge', () => {
    expect(questionImageSchema.safeParse(questionImage).success).toBe(true);
    for (const src of [
      'https://example.com/image.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
    ])
      expect(questionImageSchema.safeParse({ src, alt: '' }).success).toBe(false);
  });
  it('refuse une image de plus de 512 Ko', () => {
    const bytes = Buffer.alloc(MAX_QUESTION_IMAGE_BYTES + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    expect(
      questionImageSchema.safeParse({
        src: `data:image/png;base64,${bytes.toString('base64')}`,
        alt: '',
      }).success,
    ).toBe(false);
  });
  it('préserve les empreintes historiques sans image et distingue une modification de l’image', () => {
    expect(contentHash({ ...example, image: null })).toBe(contentHash(example));
    expect(contentHash({ ...example, image: questionImage })).not.toBe(contentHash(example));
    expect(
      contentHash({ ...example, image: { ...questionImage, alt: 'Une autre description' } }),
    ).not.toBe(contentHash({ ...example, image: questionImage }));
  });
});
describe('mémoire et jours calendaires', () => {
  const correct = { correct: true, guessed: false, reinforcement: false };
  const run = (day: string, m = emptyMemory(), result = correct) =>
    review(m, result, new Date(`${day}T12:00:00Z`), 'Europe/Paris');
  it('planifie 1, 3, 7, 14 et 30 jours et confirme la maîtrise après trois échéances', () => {
    let m = run('2026-03-27');
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-03-28');
    expect(m.status).toBe('CONSOLIDATING');
    m = run('2026-03-28', m);
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-03-31');
    m = run('2026-03-31', m);
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-04-07');
    expect(m.status).toBe('MASTERED');
    m = run('2026-04-07', m);
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-04-21');
    m = run('2026-04-21', m);
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-05-21');
  });
  it('n’accélère ni le même jour ni avant l’échéance', () => {
    let m = run('2026-01-01');
    m = run('2026-01-01', m);
    expect(m.reliableStreak).toBe(1);
    m = run('2026-01-02', m);
    m = run('2026-01-03', m);
    expect(m.reliableStreak).toBe(2);
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-01-05');
    expect(m.successCount).toBe(4);
  });
  it('réinitialise une série après une erreur ou une réponse devinée', () => {
    for (const result of [
      { correct: false, guessed: false, reinforcement: false },
      { correct: true, guessed: true, reinforcement: false },
    ]) {
      const m = run('2026-01-02', run('2026-01-01'), result);
      expect(m.status).toBe('FRAGILE');
      expect(m.reliableStreak).toBe(0);
      expect(dateOnly(m.nextReviewAt!)).toBe('2026-01-03');
    }
  });
  it('préserve les preuves récentes quand un ancien examen est clôturé plus tard', () => {
    let current = run('2026-01-01');
    current = run('2026-01-02', current);
    current = run('2026-01-05', current);
    const delayed = run('2026-01-03', current, {
      correct: false,
      guessed: false,
      reinforcement: false,
    });
    expect(delayed.status).toBe('MASTERED');
    expect(delayed.reliableStreak).toBe(3);
    expect(delayed.nextReviewAt).toEqual(current.nextReviewAt);
    expect(delayed.lastReviewedAt).toEqual(current.lastReviewedAt);
    expect(delayed.failureCount).toBe(current.failureCount + 1);
  });
  it('ne considère pas le renforcement comme un succès fiable', () => {
    const m = run('2026-01-01', emptyMemory(), {
      correct: false,
      guessed: false,
      reinforcement: false,
    });
    expect(run('2026-01-01', m, { ...correct, reinforcement: true })).toEqual(m);
  });
  it('gère les fuseaux, minuit et les changements d’heure', () => {
    expect(localDay(new Date('2026-03-28T23:30:00Z'), 'Europe/Paris')).toBe('2026-03-29');
    expect(localDay(new Date('2026-11-01T00:30:00Z'), 'America/New_York')).toBe('2026-10-31');
    const m = review(emptyMemory(), correct, new Date('2026-03-28T23:30:00Z'), 'Europe/Paris');
    expect(dateOnly(m.nextReviewAt!)).toBe('2026-03-30');
  });
  it('garde les questions en retard dues et sélectionne sans doublons', () => {
    const all = Array.from({ length: 100 }, (_, i) => ({
      id: `q${i}`,
      notion: `Notion ${i % 4}`,
      memory:
        i < 50
          ? {
              status: 'FRAGILE' as const,
              nextReviewAt: new Date('2026-01-01'),
              lastFailureAt: new Date('2026-01-01'),
            }
          : null,
    }));
    const selected = selectQuestions(all, 20, 'REVISION', '2026-11-20', seeded(42));
    expect(new Set(selected.map((q) => q.id)).size).toBe(20);
    expect(selected.filter((q) => q.memory).length).toBeGreaterThanOrEqual(15);
    expect(selected.filter((q) => !q.memory).length).toBeGreaterThanOrEqual(4);
    expect(selectQuestions(all, 20, 'REVISION', '2026-11-20', seeded(42))).toEqual(selected);
    expect(selectQuestions(all, 200, 'DISCOVERY', '2026-11-20', seeded(7))).toHaveLength(100);
  });
});
describe('statistiques réelles', () => {
  it('distingue le score, la couverture et la maîtrise, avec pondération', () => {
    const qs = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      notion: '',
      memories:
        i < 10
          ? [
              {
                status: i < 3 ? 'MASTERED' : 'FRAGILE',
                lastReviewedAt: new Date(),
                nextReviewAt: new Date('2026-01-01'),
              },
            ]
          : [],
    }));
    const s = summarize(qs, '2026-11-20', [{ correct: 8, total: 10, at: new Date() }]);
    expect(s.coverage).toBe(10);
    expect(s.mastery).toBe(3);
    expect(s.lastScore).toBe(80);
    expect(s.due).toBe(10);
    expect(s.fresh).toBe(90);
  });
  it('ne présente pas un cours vierge comme évalué à zéro', () => {
    expect(summarize([], '2026-11-20', []).lastScore).toBeNull();
  });
});
