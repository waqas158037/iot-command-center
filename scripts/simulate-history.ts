/**
 * Backfills labelled SIMULATED history for a project so charts and reports have data.
 *
 *   npm run simulator:history -- --project SHEM-DEMO --hours 48 --interval 10 --devices 2
 *
 * Refuses to run when the simulator is disabled (ENABLE_SIMULATOR / ALLOW_SIMULATOR_IN_PRODUCTION).
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { simulatorAllowed } from "@/lib/env";
import { generateHistory } from "@/server/services/simulation";
import { recordAudit } from "@/server/services/audit";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  if (!simulatorAllowed()) throw new Error("The simulator is disabled in this environment.");
  const code = arg("project");
  if (!code) throw new Error("Usage: --project <PROJECT_CODE> [--hours 24] [--interval 10] [--devices 2]");
  const project = await prisma.project.findUnique({ where: { projectCode: code.toUpperCase() }, select: { id: true, name: true } });
  if (!project) throw new Error(`No project with code ${code}`);
  const opts = { hours: Math.min(24 * 14, Number(arg("hours", "24"))), intervalMinutes: Math.max(1, Number(arg("interval", "10"))), deviceCount: Math.min(10, Number(arg("devices", "2"))) };
  const result = await generateHistory(project.id, opts);
  await recordAudit({ action: "simulation.history", resourceType: "project", resourceId: project.id, metadata: { ...opts, ...result, via: "cli" } });
  console.log(`Generated simulated history for ${project.name}:`, result);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
