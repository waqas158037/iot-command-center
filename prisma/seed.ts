/**
 * Reproducible seed.
 *
 *  1. Always: the 16 project types and default platform settings (idempotent).
 *  2. Demo data (skipped when SEED_DEMO_DATA=false, and in production unless SEED_DEMO_DATA=true):
 *     four demo users, one demo project per type, simulated devices, 24 h of labelled
 *     simulated history, and a few alerts produced through the real ingestion pipeline.
 *
 * Demo passwords come from DEMO_PASSWORD, or are generated and printed once. None are committed.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { UserRole, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { PROJECT_TYPES } from "@/lib/project-types/registry";
import { syncProjectTypes } from "@/server/services/project-types";
import { createProject } from "@/server/services/projects";
import { generateHistory } from "@/server/services/simulation";
import { ingestTelemetry } from "@/server/services/telemetry-ingest";
import { platformSettingsSchema } from "@/server/services/settings";

const DEMO_USERS: { email: string; name: string; role: UserRole }[] = [
  { email: "admin@demo.local", name: "Ayesha Admin", role: "SUPER_ADMIN" },
  { email: "manager@demo.local", name: "Bilal Manager", role: "PROJECT_MANAGER" },
  { email: "engineer@demo.local", name: "Sana Engineer", role: "ENGINEER" },
  { email: "viewer@demo.local", name: "Omar Viewer", role: "VIEWER" },
];

function projectCode(key: string) {
  return key.split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 6) + "-DEMO";
}

async function main() {
  const types = await syncProjectTypes(prisma);
  console.log(`✓ ${types} project types synchronised`);

  await prisma.appSetting.upsert({ where: { key: "platform" }, create: { key: "platform", value: platformSettingsSchema.parse({}) }, update: {} });
  console.log("✓ platform settings present");

  const demoFlag = process.env.SEED_DEMO_DATA;
  const isProd = process.env.NODE_ENV === "production";
  if (demoFlag === "false" || (isProd && demoFlag !== "true")) {
    console.log("• demo data skipped");
    return;
  }

  // ── Demo users ──
  let password = process.env.DEMO_PASSWORD;
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString("base64url") + "7d";
    generated = true;
  }
  const passwordHash = await hashPassword(password);
  const users: Record<string, { id: string; role: UserRole; isActive: boolean }> = {};
  let createdUsers = 0;
  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    const user = existing ?? (await prisma.user.create({ data: { ...u, passwordHash, notificationPreferences: { minSeverity: "LOW", deviceOffline: true, alertUpdates: true, email: false } } }));
    if (!existing) createdUsers++;
    users[u.role] = { id: user.id, role: user.role, isActive: user.isActive };
  }
  console.log(`✓ demo users ready (${createdUsers} created)`);
  if (createdUsers > 0 && generated) console.log(`  Demo password for new demo accounts (shown once): ${password}`);
  else if (createdUsers > 0) console.log("  Demo accounts use the password from DEMO_PASSWORD.");

  const admin = users.SUPER_ADMIN;

  // ── Demo projects ──
  // Memberships deliberately differ so cross-project access control can be demonstrated:
  // the viewer sees only three projects; the engineer sees six.
  const engineerProjects = new Set(["smart-home-energy-management", "indoor-plant-irrigation", "forest-fire-detection", "urban-air-quality", "remote-patient-monitoring", "smart-door-lock"]);
  const viewerProjects = new Set(["home-electricity-monitoring", "solar-weather-station", "automated-waste-segregation"]);

  let createdProjects = 0;
  for (const [i, t] of PROJECT_TYPES.entries()) {
    const code = projectCode(t.key);
    if (await prisma.project.findUnique({ where: { projectCode: code } })) continue;
    const project = await createProject(admin, {
      name: `${t.name.split(" with ")[0].split(" Using ")[0]} — Demo`,
      projectCode: code,
      description: `Demonstration project for "${t.name}". All telemetry is SIMULATED.`,
      projectTypeKey: t.key,
      status: i % 7 === 6 ? "PLANNING" : "ACTIVE",
      applyTemplateRules: true,
    });
    const members: { userId: string; projectRole: ProjectRole }[] = [];
    if (i < 10) members.push({ userId: users.PROJECT_MANAGER.id, projectRole: "MANAGER" });
    if (engineerProjects.has(t.key)) members.push({ userId: users.ENGINEER.id, projectRole: "ENGINEER" });
    if (viewerProjects.has(t.key)) members.push({ userId: users.VIEWER.id, projectRole: "VIEWER" });
    if (members.length) await prisma.projectMember.createMany({ data: members.map((m) => ({ ...m, projectId: project.id })), skipDuplicates: true });

    await generateHistory(project.id, { hours: 24, intervalMinutes: 10, deviceCount: 2, seed: "seed-v1" });
    createdProjects++;
  }
  console.log(`✓ ${createdProjects} demo projects created with 24 h of simulated history`);

  // ── Example alerts through the real pipeline (abnormal simulated readings) ──
  const examples: { type: string; readings: { sensorKey: string; value: number }[]; repeat: number }[] = [
    { type: "forest-fire-detection", readings: [{ sensorKey: "smoke", value: 2950 }, { sensorKey: "temperature", value: 48 }], repeat: 2 },
    { type: "urban-air-quality", readings: [{ sensorKey: "pm25", value: 182 }], repeat: 3 },
    { type: "indoor-plant-irrigation", readings: [{ sensorKey: "tank_level", value: 8 }], repeat: 1 },
    { type: "smart-door-lock", readings: [{ sensorKey: "lock_state", value: 2 }], repeat: 1 },
  ];
  const alertsBefore = await prisma.alert.count();
  for (const ex of examples) {
    const project = await prisma.project.findUnique({ where: { projectCode: projectCode(ex.type) } });
    if (!project) continue;
    const device = await prisma.device.findFirst({ where: { projectId: project.id, protocol: "SIMULATED" }, orderBy: { createdAt: "asc" } });
    if (!device) continue;
    for (let n = 0; n < ex.repeat; n++) {
      // Slightly after the backfilled history so the readings are in order and drive alerts.
      const t = new Date(Date.now() + n * 1000);
      await ingestTelemetry(device, { messageId: `seed-alert:${t.getTime()}`, timestamp: t.toISOString(), readings: ex.readings }, "SIMULATED", new Date());
    }
  }
  console.log(`✓ ${(await prisma.alert.count()) - alertsBefore} example alerts raised by the rule engine`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
