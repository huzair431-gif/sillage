import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
export default async function setup() {
  const url = process.env.E2E_DATABASE_URL!;
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: resolve('apps/api'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
  const email = `e2e-${randomUUID()}@test.invalid`,
    password = randomUUID() + '!a';
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const u = await db.user.create({
    data: {
      email,
      name: 'Camille',
      passwordHash: await argon2.hash(password),
      preferences: { create: { autoAdvanceEnabled: false } },
    },
  });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/account.json', JSON.stringify({ email, password, id: u.id }), {
    mode: 0o600,
  });
  await db.$disconnect();
}
