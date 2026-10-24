import { prisma } from "@/lib/db";
import { getSettings } from "@/server/services/settings";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";

/** Deletes telemetry older than the configured retention, in bounded batches. */
export async function runRetention(now = new Date()) {
  const settings = await getSettings();
  await purgeExpiredRateLimits();
  let deleted = 0;
  if (settings.telemetryRetentionDays) {
    const cutoff = new Date(now.getTime() - settings.telemetryRetentionDays * 86400_000);
    for (let i = 0; i < 20; i++) {
      const n = await prisma.$executeRaw`
        DELETE FROM "TelemetryReading" WHERE id IN (
          SELECT id FROM "TelemetryReading" WHERE "occurredAt" < ${cutoff} LIMIT 5000)`;
      deleted += n;
      if (n < 5000) break;
    }
  }
  // Health and biometric projects keep readings for a shorter, separately configured period.
  const sensitiveCutoff = new Date(now.getTime() - settings.sensitiveDataRetentionDays * 86400_000);
  for (let i = 0; i < 20; i++) {
    const n = await prisma.$executeRaw`
      DELETE FROM "TelemetryReading" WHERE id IN (
        SELECT r.id FROM "TelemetryReading" r
        JOIN "Project" p ON p.id = r."projectId"
        JOIN "ProjectType" t ON t.id = p."projectTypeId"
        WHERE t."isSensitive" AND r."occurredAt" < ${sensitiveCutoff} LIMIT 5000)`;
    deleted += n;
    if (n < 5000) break;
  }
  return deleted;
}
