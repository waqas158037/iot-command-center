import { prisma } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by PostgreSQL so limits hold across app and worker instances.
 * One atomic upsert per call.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, now(), 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - make_interval(secs => ${windowSeconds})
                     THEN now() ELSE "RateLimitBucket"."windowStart" END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - make_interval(secs => ${windowSeconds})
                     THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", "windowStart"`;
  const { count, windowStart } = rows[0];
  const resetAt = windowStart.getTime() + windowSeconds * 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

export async function purgeExpiredRateLimits() {
  return prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
