import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL doit désigner une base dédiée se terminant par _test.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const origin = 'https://sillage-production.test';
const base = 'http://127.0.0.1:3004';
const email = `production-${randomUUID()}@test.invalid`;
const password = randomUUID();
const registrationEmail = `signup-${randomUUID()}@test.invalid`;
const concurrentEmail = `concurrent-${randomUUID()}@test.invalid`;
let userId: string | undefined;
let server: ChildProcess | undefined;
let logs = '';

beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: resolve('apps/api'), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' },
  );
  userId = (
    await db.user.create({
      data: {
        email,
        name: 'Vérification production',
        passwordHash: await argon2.hash(password),
        preferences: { create: {} },
      },
    })
  ).id;
  server = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      WEB_ORIGIN: origin,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3004',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => (logs = (logs + chunk).slice(-10000)));
  server.stderr?.on('data', (chunk) => (logs = (logs + chunk).slice(-10000)));
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(logs || 'Le serveur de production n’a pas démarré.');
});

afterAll(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((done) => server!.once('exit', done));
    server.kill('SIGTERM');
    await stopped;
  }
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await db.user.deleteMany({ where: { email: { in: [registrationEmail, concurrentEmail] } } });
  await db.$disconnect();
});

describe('configuration de production', () => {
  it('sert le frontend et les routes de navigation avec les en-têtes HTTPS', async () => {
    for (const path of ['/', '/quiz/session-de-verification']) {
      const response = await fetch(base + path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('<div id="root">');
      expect(response.headers.get('content-security-policy')).toContain(
        'upgrade-insecure-requests',
      );
    }
    expect((await fetch(`${base}/api/docs`)).status).toBe(404);
  });

  it.each(['User', 'UserPreferences', 'AuthSession'])(
    'refuse la disponibilité quand la table %s manque, sans exposer les détails SQL',
    async (table) => {
      const hidden = `_readiness_${table}`;
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" RENAME TO "${hidden}"`);
      try {
        const response = await fetch(`${base}/api/health`);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe('INTERNAL');
        expect(body.error.requestId).toEqual(expect.any(String));
        expect(JSON.stringify(body)).not.toContain(hidden);
        expect(JSON.stringify(body)).not.toContain('SELECT');
        expect(JSON.stringify(body)).not.toContain(password);
      } finally {
        await db.$executeRawUnsafe(`ALTER TABLE "${hidden}" RENAME TO "${table}"`);
      }
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
    },
  );

  it('authentifie sur l’origine HTTPS exacte avec des cookies sécurisés', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith('__Host-sillage='));
    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain('Path=/');
    expect(session).not.toContain('Domain=');
    expect(cookies.find((cookie) => cookie.startsWith('sillage_csrf='))).toContain('Secure');
  });

  it('refuse une connexion depuis une origine étrangère', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: 'https://autre-site.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('refuse les inscriptions invalides sans créer de compte', async () => {
    const before = await db.user.count();
    const valid = { name: 'Camille', email: registrationEmail, password };
    for (const body of [
      { ...valid, name: '   ' },
      { ...valid, email: 'adresse-invalide' },
      { ...valid, password: 'court' },
      { ...valid, password: 'x'.repeat(1025) },
      { ...valid, isAdmin: true },
    ]) {
      const response = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
    expect(await db.user.count()).toBe(before);
  });

  it('crée le compte, ses préférences et une session immédiatement utilisable', async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ' Camille ',
        email: ` ${registrationEmail.toUpperCase()} `,
        password,
      }),
    });
    expect(response.status).toBe(201);
    const account = await response.json();
    expect(account.name).toBe('Camille');
    expect(account.email).toBe(registrationEmail);
    expect(account.csrf).toEqual(expect.any(String));
    expect(account.passwordHash).toBeUndefined();
    const stored = await db.user.findUniqueOrThrow({
      where: { email: registrationEmail },
      include: { preferences: true, authSessions: true },
    });
    expect(await argon2.verify(stored.passwordHash, password)).toBe(true);
    expect(stored.preferences).not.toBeNull();
    expect(stored.authSessions).toHaveLength(1);
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((cookie) => cookie.startsWith('__Host-sillage='))).toContain('Secure');
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const headers = { Cookie: cookie, Origin: origin };
    const me = await fetch(`${base}/api/auth/me`, { headers });
    expect(me.status).toBe(200);
    expect((await me.json()).id).toBe(account.id);
    const dashboard = await fetch(`${base}/api/dashboard`, { headers });
    expect(dashboard.status).toBe(200);
    expect((await dashboard.json()).subjects).toEqual([]);
    const write = { ...headers, 'Content-Type': 'application/json' };
    expect(
      (
        await fetch(`${base}/api/subjects`, {
          method: 'POST',
          headers: write,
          body: JSON.stringify({ name: 'Mon cours' }),
        })
      ).status,
    ).toBe(403);
    const subject = await fetch(`${base}/api/subjects`, {
      method: 'POST',
      headers: { ...write, 'X-CSRF-Token': account.csrf },
      body: JSON.stringify({ name: 'Mon cours' }),
    });
    expect(subject.status).toBe(201);
    const other = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const otherCookie = other.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(
      (
        await fetch(`${base}/api/subjects/${(await subject.json()).id}`, {
          headers: { Cookie: otherCookie, Origin: origin },
        })
      ).status,
    ).toBe(404);
  });

  it('refuse une adresse déjà utilisée sans changer le compte existant', async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Autre nom', email: registrationEmail.toUpperCase(), password }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain('déjà utilisée');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(await db.user.count({ where: { email: registrationEmail } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { email: registrationEmail } })).name).toBe(
      'Camille',
    );
  });

  it('ne crée qu’un compte lors de deux inscriptions simultanées', async () => {
    const responses = await Promise.all(
      [0, 1].map(() =>
        fetch(`${base}/api/auth/register`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Camille', email: concurrentEmail, password }),
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await db.user.count({ where: { email: concurrentEmail } })).toBe(1);
    const user = await db.user.findUniqueOrThrow({
      where: { email: concurrentEmail },
      include: { authSessions: true },
    });
    expect(user.authSessions).toHaveLength(1);
  });

  it('refuse une inscription depuis une origine étrangère', async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: 'https://autre-site.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Camille', email: `blocked-${registrationEmail}`, password }),
    });
    expect(response.status).toBe(403);
    expect(await db.user.count({ where: { email: `blocked-${registrationEmail}` } })).toBe(0);
  });

  it('limite les tentatives d’inscription répétées', async () => {
    let limited = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Camille', email: registrationEmail, password }),
      });
      expect([409, 429]).toContain(response.status);
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
