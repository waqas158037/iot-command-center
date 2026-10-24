import { prisma } from "@/lib/db";

/**
 * PostgreSQL-backed lease: only the holder runs the job. Leases expire, so a crashed worker
 * is replaced automatically by another instance after `ttlSeconds`.
 */
export async function acquireLease(name: string, holderId: string, ttlSeconds: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ holderId: string }[]>`
    INSERT INTO "WorkerLease" ("name", "holderId", "expiresAt", "updatedAt")
    VALUES (${name}, ${holderId}, now() + make_interval(secs => ${ttlSeconds}), now())
    ON CONFLICT ("name") DO UPDATE SET
      "holderId" = EXCLUDED."holderId", "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = now()
    WHERE "WorkerLease"."holderId" = ${holderId} OR "WorkerLease"."expiresAt" < now()
    RETURNING "holderId"`;
  return rows.length === 1 && rows[0].holderId === holderId;
}

export async function releaseLease(name: string, holderId: string) {
  await prisma.workerLease.deleteMany({ where: { name, holderId } });
}
