import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { testDatabaseUrl } from "./db-url";

// Second guard: never truncate a database that is not explicitly a test database.
testDatabaseUrl();
if (!/test/i.test(new URL(process.env.DATABASE_URL ?? "invalid://x").pathname)) {
  throw new Error("DATABASE_URL is not a test database; refusing to run integration tests");
}

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
