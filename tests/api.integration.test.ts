import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { toMarkdown } from '@sillage/quiz-parser';
import type { QuizSession, QuestionInput, Stats } from '@sillage/shared';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL doit désigner une base dédiée dont le nom se termine par _test.',
  );
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const base = 'http://127.0.0.1:3002/api';
const origin = 'http://localhost:5174';
type Login = { cookie: string; csrf: string };
let a: Login, b: Login;
let processApi: ChildProcess;
let subjectId = '',
  chapterId = '';
let userA = '',
  userB = '';
let logs = '';
const fixture: QuestionInput[] = Array.from({ length: 40 }, (_, i) => ({
  externalId: `test-${i}`,
  statement: `Que mesure la relation ${i + 1} ?`,
  type: 'SINGLE',
  notion: `Notion ${i % 4}`,
  difficulty: 'MEDIUM',
  options: [
    { text: `Réponse exacte ${i}`, isCorrect: true },
    { text: `Distracteur ${i}`, isCorrect: false },
  ],
  explanation: `La relation ${i + 1} mesure la grandeur étudiée. Cette explication appartient à la question ${i}.`,
}));
async function request<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
  auth?: Login,
  headers: Record<string, string> = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: (await response.json()) as T, response };
}
async function login(email: string, password: string) {
  const r = await request<{ csrf: string }>('/auth/login', 'POST', { email, password });
  expect(r.status).toBe(201);
  return {
    csrf: r.data.csrf,
    cookie: r.response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
async function importBatch(questions: QuestionInput[], mode = 'replace') {
  const p = await request<{ revision: number; summary: Record<string, number> }>(
    `/chapters/${chapterId}/imports/preview`,
    'POST',
    { questions, mode },
    a,
  );
  expect(p.status).toBe(201);
  const result = await request(
    `/chapters/${chapterId}/imports/commit`,
    'POST',
    { questions, mode, expectedRevision: p.data.revision },
    a,
  );
  return { ...result, preview: p.data };
}
async function choose(s: QuizSession, correct: boolean, guessed = false) {
  const item = s.questions.find((x) => !x.answered)!;
  const version = await db.sessionQuestion.findUniqueOrThrow({
    where: { id: item.id },
    include: { questionVersion: true },
  });
  const snapshot = version.questionVersion.snapshot as unknown as {
    options: { id: string; isCorrect: boolean }[];
  };
  const options = snapshot.options
    .filter((o) => o.isCorrect === correct)
    .map((o) => o.id)
    .slice(0, 1);
  const payload = {
    sessionQuestionId: item.id,
    selectedOptionIds: options,
    isGuessed: guessed,
    idempotencyKey: randomUUID(),
  };
  return {
    payload,
    result: await request<QuizSession>(`/quiz/sessions/${s.id}/answers`, 'POST', payload, a),
  };
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: resolve('apps/api'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
  const suffix = randomUUID();
  const password = randomUUID() + '!A';
  const passwordHash = await argon2.hash(password);
  userA = (
    await db.user.create({
      data: {
        email: `a-${suffix}@test.invalid`,
        name: 'Test A',
        passwordHash,
        preferences: { create: {} },
      },
    })
  ).id;
  userB = (
    await db.user.create({
      data: {
        email: `b-${suffix}@test.invalid`,
        name: 'Test B',
        passwordHash,
        preferences: { create: {} },
      },
    })
  ).id;
  processApi = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: resolve('.'),
    env: { ...process.env, DATABASE_URL: url, WEB_ORIGIN: origin, PORT: '3002', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processApi.stdout?.on('data', (c) => (logs = (logs + c).slice(-15000)));
  processApi.stderr?.on('data', (c) => (logs = (logs + c).slice(-15000)));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error(logs);
  a = await login(`a-${suffix}@test.invalid`, password);
  b = await login(`b-${suffix}@test.invalid`, password);
});
afterAll(async () => {
  processApi?.kill('SIGTERM');
  if (userA) await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await db.$disconnect();
});
describe.sequential('API réelle et PostgreSQL', () => {
  it('authentifie, protège les mutations CSRF et refuse les origines étrangères', async () => {
    expect((await request('/subjects')).status).toBe(401);
    expect(
      (await request('/subjects', 'POST', { name: 'X' }, a, { 'X-CSRF-Token': '' })).status,
    ).toBe(403);
    expect(
      (await request('/subjects', 'POST', { name: 'X' }, a, { Origin: 'https://evil.invalid' }))
        .status,
    ).toBe(403);
    const r = await request<{ id: string }>(
      '/subjects',
      'POST',
      { name: 'PC40', description: 'Tests d’intégration', color: 'indigo' },
      a,
    );
    expect(r.status).toBe(201);
    subjectId = r.data.id;
    expect((await request(`/subjects/${subjectId}`, 'GET', undefined, b)).status).toBe(404);
  });
  it('crée un chapitre, valide les entrées et assure l’isolation', async () => {
    expect(
      (await request(`/subjects/${subjectId}/chapters`, 'POST', { title: '' }, a)).status,
    ).toBe(400);
    const r = await request<{ id: string }>(
      `/subjects/${subjectId}/chapters`,
      'POST',
      { title: 'Loi d’Amdahl' },
      a,
    );
    expect(r.status).toBe(201);
    chapterId = r.data.id;
    expect((await request(`/chapters/${chapterId}`, 'GET', undefined, b)).status).toBe(404);
    expect(
      (await request(`/subjects/${subjectId}/chapters/order`, 'PATCH', { ids: [randomUUID()] }, a))
        .status,
    ).toBe(409);
  });
  it('importe 40 questions atomiquement et refuse un lot invalide sans écriture partielle', async () => {
    const bad = fixture.map((q) => ({ ...q }));
    bad[20] = { ...bad[20]!, explanation: '' };
    expect(
      (
        await request(
          `/chapters/${chapterId}/imports/commit`,
          'POST',
          { questions: bad, mode: 'append', expectedRevision: 0 },
          a,
        )
      ).status,
    ).toBe(400);
    expect(await db.question.count({ where: { chapterId } })).toBe(0);
    const r = await importBatch(fixture, 'append');
    expect(r.status).toBe(201);
    expect(await db.question.count({ where: { chapterId } })).toBe(40);
    expect(
      (
        await request(
          `/chapters/${chapterId}/imports/commit`,
          'POST',
          { questions: fixture, mode: 'replace', expectedRevision: 0 },
          a,
        )
      ).status,
    ).toBe(409);
    const dup = await importBatch(fixture, 'replace');
    expect(dup.preview.summary).toMatchObject({ kept: 40, changed: 0, removed: 0 });
  });
  it('fige les versions, contrôle les choix, calcule la justesse et rend les réponses idempotentes', async () => {
    const start = await request<QuizSession>(
      '/quiz/sessions',
      'POST',
      { chapterId, mode: 'DISCOVERY', count: 4 },
      a,
    );
    expect(start.status).toBe(201);
    let s = start.data;
    expect(JSON.stringify(s)).not.toContain('isCorrect');
    expect(JSON.stringify(s)).not.toContain('explanation');
    expect((await request(`/quiz/sessions/${s.id}`, 'GET', undefined, b)).status).toBe(404);
    const bad = await request(
      `/quiz/sessions/${s.id}/answers`,
      'POST',
      {
        sessionQuestionId: s.questions[0]!.id,
        selectedOptionIds: [randomUUID()],
        idempotencyKey: randomUUID(),
        isCorrect: true,
      },
      a,
    );
    expect(bad.status).toBe(400);
    expect(await db.answerAttempt.count({ where: { sessionId: s.id } })).toBe(0);
    const first = await choose(s, true);
    expect(first.result.status).toBe(201);
    s = first.result.data;
    expect(s.questions[0]!.feedback?.isCorrect).toBe(true);
    expect((await request(`/quiz/sessions/${s.id}/answers`, 'POST', first.payload, a)).status).toBe(
      201,
    );
    expect(
      (
        await request(
          `/quiz/sessions/${s.id}/answers`,
          'POST',
          { ...first.payload, idempotencyKey: randomUUID() },
          a,
        )
      ).status,
    ).toBe(409);
    expect(await db.answerAttempt.count({ where: { sessionId: s.id } })).toBe(1);
    const second = await choose(s, false);
    s = second.result.data;
    const failed = s.questions.find((q) => q.feedback && !q.feedback.isCorrect)!;
    expect(failed.feedback?.acknowledged).toBe(false);
    expect(s.questions.filter((q) => q.isReinforcement)).toHaveLength(1);
    expect((await choose(s, true)).result.status).toBe(409);
    const ack = await request<QuizSession>(
      `/quiz/sessions/${s.id}/corrections/${failed.id}/ack`,
      'POST',
      {},
      a,
    );
    expect(ack.status).toBe(201);
    s = ack.data;
    const guessed = await choose(s, true, true);
    s = guessed.result.data;
    s = (await choose(s, true)).result.data;
    s = (await choose(s, true)).result.data;
    const done = await request<QuizSession>(`/quiz/sessions/${s.id}/finish`, 'POST', {}, a);
    expect(done.data.score).toBe(75);
    expect(done.data.correct).toBe(3);
    expect(done.data.errors).toBe(1);
    expect(await db.answerAttempt.count({ where: { sessionId: s.id } })).toBe(5);
    const state = await db.memoryState.findUniqueOrThrow({
      where: { userId_questionId: { userId: userA, questionId: failed.questionId } },
    });
    expect(state.status).toBe('FRAGILE');
    expect(state.reliableStreak).toBe(0);
  });
  it.each(['DISCOVERY', 'EXAM'] as const)(
    'compte une absence de réponse après expiration comme une erreur en mode %s',
    async (mode) => {
      let s = (
        await request<QuizSession>('/quiz/sessions', 'POST', { chapterId, mode, count: 2 }, a)
      ).data;
      const payload = {
        sessionQuestionId: s.questions[0]!.id,
        selectedOptionIds: [],
        isGuessed: false,
        idempotencyKey: randomUUID(),
      };
      expect((await request(`/quiz/sessions/${s.id}/answers`, 'POST', payload, a)).status).toBe(
        400,
      );
      const timedOut = { ...payload, timedOut: true };
      const response = await request<QuizSession>(
        `/quiz/sessions/${s.id}/answers`,
        'POST',
        timedOut,
        a,
      );
      expect(response.status).toBe(201);
      s = response.data;
      expect(s.questions[0]!.answered).toBe(true);
      expect(s.questions[0]!.selectedOptionIds).toEqual([]);
      expect((await request(`/quiz/sessions/${s.id}/answers`, 'POST', timedOut, a)).status).toBe(
        201,
      );
      expect(await db.answerAttempt.count({ where: { sessionId: s.id } })).toBe(1);
      if (mode === 'DISCOVERY') {
        expect(s.questions[0]!.feedback?.isCorrect).toBe(false);
        expect(s.questions.filter((q) => q.isReinforcement)).toHaveLength(1);
        await request(
          `/quiz/sessions/${s.id}/corrections/${payload.sessionQuestionId}/ack`,
          'POST',
          {},
          a,
        );
      } else {
        expect(s.questions[0]!.feedback).toBeUndefined();
      }
      const done = await request<QuizSession>(`/quiz/sessions/${s.id}/finish`, 'POST', {}, a);
      expect(done.status).toBe(201);
      expect(done.data.score).toBe(0);
      expect(done.data.errors).toBe(mode === 'EXAM' ? 2 : 1);
    },
  );
  it('ne divulgue aucune correction ni résultat intermédiaire pendant un examen', async () => {
    let s = (
      await request<QuizSession>('/quiz/sessions', 'POST', { chapterId, mode: 'EXAM', count: 2 }, a)
    ).data;
    const before = await db.memoryState.count({ where: { userId: userA } });
    s = (await choose(s, true)).result.data;
    expect(JSON.stringify(s)).not.toContain('isCorrect');
    expect(JSON.stringify(s)).not.toContain('explanation');
    expect(s.score).toBeNull();
    expect(s.correct).toBe(0);
    expect(await db.memoryState.count({ where: { userId: userA } })).toBe(before);
    s = (await request<QuizSession>(`/quiz/sessions/${s.id}`, 'GET', undefined, a)).data;
    expect(s.questions[0]!.feedback).toBeUndefined();
    s = (await request<QuizSession>(`/quiz/sessions/${s.id}/finish`, 'POST', {}, a)).data;
    expect(s.score).toBe(50);
    expect(s.questions.every((q) => q.feedback)).toBe(true);
  });
  it('vérifie l’échéance de l’examen côté serveur et permet la reprise', async () => {
    const s = (
      await request<QuizSession>(
        '/quiz/sessions',
        'POST',
        { chapterId, mode: 'EXAM', count: 2, timeLimitMinutes: 1 },
        a,
      )
    ).data;
    const deadline = new Date(Date.now() - 3 * 86400000);
    await db.quizSession.update({
      where: { id: s.id },
      data: { deadlineAt: deadline },
    });
    expect((await choose(s, true)).result.status).toBe(409);
    const expired = await request<QuizSession>(`/quiz/sessions/${s.id}`, 'GET', undefined, a);
    expect(expired.data.status).toBe('COMPLETED');
    expect(expired.data.score).toBe(0);
    expect(expired.data.errors).toBe(2);
    const attempts = await db.answerAttempt.findMany({ where: { sessionId: s.id } });
    expect(attempts.every((attempt) => attempt.answeredAt.getTime() === deadline.getTime())).toBe(
      true,
    );
  });
  it('préserve la progression inchangée, réinitialise une modification et conserve les anciens snapshots', async () => {
    const state = await db.memoryState.findFirstOrThrow({ where: { userId: userA } });
    const unchanged = await importBatch(fixture);
    expect(unchanged.status).toBe(201);
    expect((await db.memoryState.findUnique({ where: { id: state.id } }))?.status).toBe(
      state.status,
    );
    const q = await db.question.findUniqueOrThrow({ where: { id: state.questionId } });
    const next = fixture.map((f) =>
      f.externalId === q.externalId ? { ...f, statement: f.statement + ' Version modifiée.' } : f,
    );
    const change = await importBatch(next);
    expect(change.preview.summary.changed).toBe(1);
    expect(await db.memoryState.findUnique({ where: { id: state.id } })).toBeNull();
    expect(await db.questionVersion.count({ where: { questionId: q.id } })).toBe(2);
    expect(await db.answerAttempt.count({ where: { questionId: q.id } })).toBeGreaterThan(0);
    const history = await request<{ versions: unknown[]; attempts: unknown[] }>(
      `/questions/${q.id}/history`,
      'GET',
      undefined,
      a,
    );
    expect(history.data.versions).toHaveLength(2);
  });
  it('agrège les matières et chapitres avec de vraies statistiques', async () => {
    const r = await request<{ stats: Stats; subjects: { stats: Stats }[] }>(
      '/dashboard',
      'GET',
      undefined,
      a,
    );
    expect(r.status).toBe(200);
    expect(r.data.stats.total).toBe(40);
    expect(r.data.stats.mastered).toBe(0);
    expect(r.data.stats.seen).toBeGreaterThan(0);
    expect(r.data.stats.coverage).toBe(Math.round((r.data.stats.seen / 40) * 100));
    expect((await request('/statistics', 'GET', undefined, b)).status).toBe(200);
    const attempts = await db.answerAttempt.findMany({
      where: { session: { userId: userA, status: 'COMPLETED' }, isReinforcement: false },
      select: { answeredAt: true, isCorrect: true },
    });
    for (const timezone of ['Europe/Paris', 'America/New_York']) {
      await db.userPreferences.update({ where: { userId: userA }, data: { timezone } });
      const expected = new Map<string, { day: string; answers: number; correct: number }>();
      for (const attempt of attempts) {
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(attempt.answeredAt);
        const row = expected.get(day) ?? { day, answers: 0, correct: 0 };
        row.answers++;
        row.correct += attempt.isCorrect ? 1 : 0;
        expected.set(day, row);
      }
      const actual = await request<{
        activity: { day: string; answers: number; correct: number }[];
      }>('/statistics', 'GET', undefined, a);
      expect(actual.data.activity).toEqual(
        [...expected.values()].sort((x, y) => x.day.localeCompare(y.day)),
      );
    }
    await db.userPreferences.update({
      where: { userId: userA },
      data: { timezone: 'Europe/Paris' },
    });
  });
  it('valide, restaure atomiquement et remappe tous les identifiants sans toucher aux autres comptes', async () => {
    const exported = await request<Record<string, unknown>>('/backups/export', 'GET', undefined, a);
    expect(exported.status).toBe(200);
    expect(JSON.stringify(exported.data)).not.toContain('passwordHash');
    const validation = await request<{ token: string; questions: number }>(
      '/backups/validate',
      'POST',
      exported.data,
      a,
    );
    expect(validation.status).toBe(201);
    expect(validation.data.questions).toBe(40);
    const count = await db.subject.count({ where: { userId: userA } });
    expect(
      (
        await request(
          '/backups/restore',
          'POST',
          {
            data: exported.data,
            token: validation.data.token,
            confirmation: 'REMPLACER MES DONNÉES',
          },
          b,
        )
      ).status,
    ).toBe(409);
    expect(await db.subject.count({ where: { userId: userA } })).toBe(count);
    const done = await request(
      '/backups/restore',
      'POST',
      { data: exported.data, token: validation.data.token, confirmation: 'REMPLACER MES DONNÉES' },
      a,
    );
    expect(done.status).toBe(201);
    expect(await db.subject.findUnique({ where: { id: subjectId } })).toBeNull();
    expect(await db.question.count({ where: { chapter: { subject: { userId: userA } } } })).toBe(
      40,
    );
    expect(await db.user.findUnique({ where: { id: userB } })).not.toBeNull();
    expect(
      (
        await request(
          '/backups/restore',
          'POST',
          {
            data: exported.data,
            token: validation.data.token,
            confirmation: 'REMPLACER MES DONNÉES',
          },
          a,
        )
      ).status,
    ).toBe(409);
  });
  it('déconnecte et invalide réellement la session serveur', async () => {
    expect((await request('/auth/logout', 'POST', {}, a)).status).toBe(201);
    expect((await request('/subjects', 'GET', undefined, a)).status).toBe(401);
  });
});
