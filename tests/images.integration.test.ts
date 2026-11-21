import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput, QuizSession, StoredQuestion } from '@sillage/shared';
import { questionImage } from './fixtures/question-image.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL doit désigner une base dédiée se terminant par _test.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const base = 'http://127.0.0.1:3005/api';
const origin = 'http://localhost:5174';
const emails = [0, 1].map(() => `images-${randomUUID()}@test.invalid`);
type Auth = { cookie: string; csrf: string; userId: string };
type ImageBackup = { questions: { externalId: string | null; image?: QuestionInput['image'] }[] };
let owner: Auth, other: Auth;
let server: ChildProcess | undefined;
let logs = '';
const question: QuestionInput = {
  externalId: 'image-001',
  statement: 'Que représente cette illustration ?',
  image: questionImage,
  type: 'SINGLE',
  notion: 'Schéma',
  difficulty: 'MEDIUM',
  options: [
    { text: 'Le repère A', isCorrect: true },
    { text: 'Le repère B', isCorrect: false },
  ],
  explanation: 'Le repère A répond à la question.',
};
async function request<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
  auth?: Auth,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as T, response };
}
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve('apps/api'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    },
  );
  server = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      DATABASE_URL: url,
      WEB_ORIGIN: origin,
      NODE_ENV: 'test',
      PORT: '3005',
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => (logs = (logs + chunk).slice(-10000)));
  server.stderr?.on('data', (chunk) => (logs = (logs + chunk).slice(-10000)));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error(logs);
  const accounts: Auth[] = [];
  for (const email of emails) {
    const result = await request<{ id: string; csrf: string }>('/auth/register', 'POST', {
      name: 'Images',
      email,
      password: randomUUID(),
    });
    expect(result.status).toBe(201);
    accounts.push({
      userId: result.data.id,
      csrf: result.data.csrf,
      cookie: result.response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
    });
  }
  [owner, other] = accounts as [Auth, Auth];
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((done) => server!.once('exit', done));
    server.kill('SIGTERM');
    await stopped;
  }
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

describe.sequential('questions illustrées et PostgreSQL', () => {
  it('conserve les images dans les questions, anciennes sessions et sauvegardes restaurées', async () => {
    const subject = await request<{ id: string }>('/subjects', 'POST', { name: 'Images' }, owner);
    const chapter = await request<{ id: string }>(
      `/subjects/${subject.data.id}/chapters`,
      'POST',
      { title: 'Schémas' },
      owner,
    );
    const textOnly = {
      ...question,
      externalId: 'text-001',
      statement: 'Une question sans image',
      image: undefined,
    };
    const imported = await request(
      `/chapters/${chapter.data.id}/imports/commit`,
      'POST',
      {
        questions: [question, textOnly],
        mode: 'append',
        expectedRevision: 0,
      },
      owner,
    );
    expect(imported.status).toBe(201);
    const list = await request<{ items: StoredQuestion[] }>(
      `/chapters/${chapter.data.id}/questions`,
      'GET',
      undefined,
      owner,
    );
    const illustrated = list.data.items.find((item) => item.externalId === question.externalId)!;
    expect(illustrated.image).toEqual(questionImage);
    expect(list.data.items.find((item) => item.externalId === 'text-001')!.image).toBeNull();
    expect(
      (await request(`/chapters/${chapter.data.id}/questions`, 'GET', undefined, other)).status,
    ).toBe(404);
    const started = await request<QuizSession>(
      '/quiz/sessions',
      'POST',
      {
        chapterId: chapter.data.id,
        mode: 'EXAM',
        count: 'all',
      },
      owner,
    );
    expect(
      started.data.questions.find((item) => item.questionId === illustrated.id)!.image,
    ).toEqual(questionImage);
    expect(JSON.stringify(started.data)).not.toContain('correctOptionIds');
    const updatedImage = { ...questionImage, alt: 'Schéma mis à jour' };
    expect(
      (
        await request(
          `/questions/${illustrated.id}`,
          'PATCH',
          {
            question: { ...question, image: updatedImage },
            expectedVersion: 1,
          },
          owner,
        )
      ).status,
    ).toBe(200);
    const previous = await request<QuizSession>(
      `/quiz/sessions/${started.data.id}`,
      'GET',
      undefined,
      owner,
    );
    expect(
      previous.data.questions.find((item) => item.questionId === illustrated.id)!.image,
    ).toEqual(questionImage);
    const backup = await request<ImageBackup>('/backups/export', 'GET', undefined, owner);
    expect(
      backup.data.questions.find((item) => item.externalId === question.externalId)!.image,
    ).toEqual(updatedImage);
    const validated = await request<{ token: string }>(
      '/backups/validate',
      'POST',
      backup.data,
      owner,
    );
    expect(validated.status).toBe(201);
    const restored = await request(
      '/backups/restore',
      'POST',
      {
        data: backup.data,
        token: validated.data.token,
        confirmation: 'REMPLACER MES DONNÉES',
      },
      owner,
    );
    expect(restored.status).toBe(201);
    const current = await db.question.findFirstOrThrow({
      where: { externalId: question.externalId, chapter: { subject: { userId: owner.userId } } },
    });
    expect(current.id).not.toBe(illustrated.id);
    expect(current.image).toEqual(updatedImage);
    const restoredSession = await db.quizSession.findFirstOrThrow({
      where: { userId: owner.userId },
    });
    const history = await request<QuizSession>(
      `/quiz/sessions/${restoredSession.id}`,
      'GET',
      undefined,
      owner,
    );
    expect(history.data.questions.find((item) => item.questionId === current.id)!.image).toEqual(
      questionImage,
    );
    expect(
      (
        await request(
          `/questions/${current.id}`,
          'PATCH',
          {
            question: { ...question, image: null },
            expectedVersion: 2,
          },
          owner,
        )
      ).status,
    ).toBe(200);
    expect((await db.question.findUniqueOrThrow({ where: { id: current.id } })).image).toBeNull();
    const oldSnapshot = await request<QuizSession>(
      `/quiz/sessions/${restoredSession.id}`,
      'GET',
      undefined,
      owner,
    );
    expect(
      oldSnapshot.data.questions.find((item) => item.questionId === current.id)!.image,
    ).toEqual(questionImage);
    const legacy = (await request<ImageBackup>('/backups/export', 'GET', undefined, owner)).data;
    for (const item of legacy.questions) if (item.image === null) delete item.image;
    expect((await request('/backups/validate', 'POST', legacy, owner)).status).toBe(201);
  });

  it('refuse une image externe ou un contenu déguisé', async () => {
    const chapter = await db.chapter.findFirstOrThrow({
      where: { subject: { userId: owner.userId } },
    });
    for (const src of [
      'https://example.com/photo.png',
      'data:image/png;base64,AAAA',
      'data:image/svg+xml;base64,PHN2Zz4=',
    ]) {
      const response = await request(
        `/chapters/${chapter.id}/questions`,
        'POST',
        {
          question: { ...question, externalId: randomUUID(), image: { src, alt: '' } },
          expectedRevision: chapter.revision,
        },
        owner,
      );
      expect(response.status).toBe(400);
    }
    expect(await db.question.count({ where: { chapterId: chapter.id } })).toBe(2);
  });
});
