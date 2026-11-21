import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export default async function teardown() {
  const account = JSON.parse(await readFile('test-results/account.json', 'utf8'));
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.E2E_DATABASE_URL! }),
  });
  await db.user.deleteMany({ where: { id: account.id } });
  await db.$disconnect();
}
