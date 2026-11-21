import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const count = await db.user.count();
  process.exitCode = count ? 0 : 10;
} finally {
  await db.$disconnect();
}
