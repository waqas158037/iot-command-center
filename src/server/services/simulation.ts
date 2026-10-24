import type { Prisma, SimulationStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { simulatorAllowed } from "@/lib/env";
import { badRequest, conflict, featureDisabled, notFound } from "@/lib/http/errors";
import { logger } from "@/lib/logging/logger";
import type { Actor } from "@/lib/permissions/policies";
import type { ProjectConfiguration } from "@/lib/project-types/types";
import { buildDeviceSimulators, isAbnormalTick, SensorSimulator, type Scenario } from "@/lib/simulator/generator";
import { getProjectTypeTemplate } from "@/lib/project-types/registry";
import { accessibleProjectIds, assertProjectAction } from "./access";
import { recordAudit } from "./audit";
import { createTemplateSensors } from "./devices";
import { ingestTelemetry } from "./telemetry-ingest";

export const SCENARIOS = ["NORMAL", "ABNORMAL", "MIXED", "DISCONNECT", "SENSOR_DROPOUT"] as const;

export const simulationConfigSchema = z.object({
  intervalSeconds: z.coerce.number().int().min(2).max(3600).default(10),
  scenario: z.enum(SCENARIOS).default("NORMAL"),
  deviceCount: z.coerce.number().int().min(1).max(25).default(2),
  /** Devices that stop reporting under DISCONNECT (default: the first one). */
  disconnectDeviceIds: z.array(z.string().uuid()).max(25).default([]),
  /** Sensor keys withheld under SENSOR_DROPOUT (default: the first sensor). */
  dropSensorKeys: z.array(z.string().max(64)).max(25).default([]),
});
export type SimulationConfig = z.infer<typeof simulationConfigSchema>;

export const createSimulationSchema = z.object({ projectId: z.string().uuid() }).and(simulationConfigSchema);
export const updateSimulationSchema = simulationConfigSchema.partial().extend({ status: z.enum(["RUNNING", "PAUSED"]).optional() });

function assertSimulatorEnabled() {
  if (!simulatorAllowed()) throw featureDisabled("The simulator is disabled on this deployment (set ENABLE_SIMULATOR, and ALLOW_SIMULATOR_IN_PRODUCTION in production).");
}

interface AuditCtx {
  requestId?: string;
  ip?: string;
}

/** Ensures the project has at least `count` simulated devices with the template's sensors. */
export async function ensureSimulatedDevices(projectId: string, count: number) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { projectCode: true, configuration: true } });
  const existing = await prisma.device.findMany({ where: { projectId, protocol: "SIMULATED", status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  for (let i = existing.length; i < count; i++) {
    const n = String(i + 1).padStart(2, "0");
    await prisma.$transaction(async (tx) => {
      const d = await tx.device.create({
        data: {
          name: `Simulated node ${n}`,
          deviceIdentifier: `sim-${project.projectCode.toLowerCase()}-${n}-${Math.random().toString(36).slice(2, 6)}`,
          projectId,
          protocol: "SIMULATED",
          hardwareModel: "Virtual device",
          firmwareVersion: "sim-1.0",
          locationDescription: "Simulator",
          statusEvents: { create: { newStatus: "UNKNOWN", reason: "Simulated device created" } },
        },
      });
      await createTemplateSensors(tx, d.id, project.configuration as unknown as ProjectConfiguration);
    });
  }
  return prisma.device.findMany({ where: { projectId, protocol: "SIMULATED", status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, take: count, select: { id: true } });
}

export async function listSimulations(actor: Actor, projectId?: string) {
  const ids = await accessibleProjectIds(actor);
  if (projectId && ids && !ids.includes(projectId)) throw notFound("Project");
  return prisma.simulationSession.findMany({
    where: projectId ? { projectId } : ids ? { projectId: { in: ids } } : {},
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { project: { select: { id: true, name: true, projectCode: true } }, startedBy: { select: { name: true } } },
  });
}

export async function createSimulation(actor: Actor, input: unknown, ctx: AuditCtx = {}) {
  assertSimulatorEnabled();
  const data = createSimulationSchema.parse(input);
  await assertProjectAction(actor, data.projectId, "simulation.control");
  const running = await prisma.simulationSession.findFirst({ where: { projectId: data.projectId, status: { in: ["RUNNING", "PAUSED"] } } });
  if (running) throw conflict("This project already has an active simulation. Stop it before starting another.");

  const devices = await ensureSimulatedDevices(data.projectId, data.deviceCount);
  const { projectId, ...config } = data;
  const session = await prisma.simulationSession.create({
    data: { projectId, status: "RUNNING", startedById: actor.id, configuration: { ...config, deviceIds: devices.map((d) => d.id) } as Prisma.InputJsonValue },
  });
  await recordAudit({ actorId: actor.id, action: "simulation.start", resourceType: "simulation", resourceId: session.id, metadata: { projectId, ...config }, requestId: ctx.requestId, ipAddress: ctx.ip });
  return session;
}

async function loadSession(actor: Actor, id: string) {
  const session = await prisma.simulationSession.findUnique({ where: { id } });
  if (!session) throw notFound("Simulation");
  try {
    await assertProjectAction(actor, session.projectId, "simulation.control");
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw notFound("Simulation");
    throw err;
  }
  return session;
}

export async function setSimulationStatus(actor: Actor, id: string, status: SimulationStatus, ctx: AuditCtx = {}) {
  assertSimulatorEnabled();
  const session = await loadSession(actor, id);
  if (session.status === "STOPPED") throw conflict("A stopped simulation cannot be restarted; create a new one");
  const updated = await prisma.simulationSession.update({
    where: { id },
    data: { status, ...(status === "STOPPED" ? { stoppedAt: new Date() } : {}) },
  });
  await recordAudit({ actorId: actor.id, action: `simulation.${status.toLowerCase()}`, resourceType: "simulation", resourceId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
  return updated;
}

export async function updateSimulation(actor: Actor, id: string, input: unknown, ctx: AuditCtx = {}) {
  assertSimulatorEnabled();
  const data = updateSimulationSchema.parse(input);
  const session = await loadSession(actor, id);
  if (session.status === "STOPPED") throw conflict("This simulation has stopped");
  const { status, ...config } = data;
  let configuration = { ...(session.configuration as object), ...config } as SimulationConfig & { deviceIds: string[] };
  if (config.deviceCount) {
    const devices = await ensureSimulatedDevices(session.projectId, config.deviceCount);
    configuration = { ...configuration, deviceIds: devices.map((d) => d.id) };
  }
  const updated = await prisma.simulationSession.update({ where: { id }, data: { configuration: configuration as Prisma.InputJsonValue, ...(status ? { status } : {}) } });
  await recordAudit({ actorId: actor.id, action: "simulation.update", resourceType: "simulation", resourceId: id, metadata: data, requestId: ctx.requestId, ipAddress: ctx.ip });
  return updated;
}

// ── Execution (worker only) ──────────────────────────────────────────

const simulators = new Map<string, Map<string, SensorSimulator>>();

async function simulatorsFor(sessionId: string, device: { id: string; deviceIdentifier: string }, configuration: ProjectConfiguration) {
  const key = `${sessionId}:${device.id}`;
  let sims = simulators.get(key);
  if (!sims) {
    // Continue from the last stored values so restarts don't create jumps in charts.
    const last = await prisma.$queryRaw<{ sensorKey: string; value: number }[]>`
      SELECT DISTINCT ON (s."sensorKey") s."sensorKey", r."value"::float8 AS value
      FROM "TelemetryReading" r JOIN "Sensor" s ON s.id = r."sensorId"
      WHERE r."deviceId" = ${device.id}::uuid
      ORDER BY s."sensorKey", r."occurredAt" DESC`;
    sims = buildDeviceSimulators(device.deviceIdentifier, configuration.sensors, Object.fromEntries(last.map((l) => [l.sensorKey, l.value])));
    simulators.set(key, sims);
  }
  return sims;
}

/** Runs one tick for every due RUNNING session. Called by the worker loop holding the simulator lease. */
export async function runSimulationTick(now = new Date()) {
  if (!simulatorAllowed()) return { sessions: 0, readings: 0 };
  const sessions = await prisma.simulationSession.findMany({ where: { status: "RUNNING" }, include: { project: { select: { archivedAt: true, configuration: true, projectType: { select: { key: true } } } } } });
  let readings = 0;
  for (const session of sessions) {
    const cfg = simulationConfigSchema.extend({ deviceIds: z.array(z.string()).default([]) }).parse(session.configuration);
    if (session.project.archivedAt) {
      await prisma.simulationSession.update({ where: { id: session.id }, data: { status: "STOPPED", stoppedAt: now } });
      continue;
    }
    if (session.lastTickAt && now.getTime() - session.lastTickAt.getTime() < cfg.intervalSeconds * 1000 - 250) continue;

    // Tick index derived from wall-clock time: two workers computing the same tick produce the
    // same messageId, so the unique index drops the duplicate.
    const tickIndex = Math.floor(now.getTime() / (cfg.intervalSeconds * 1000));
    const configuration = (session.project.configuration as unknown as ProjectConfiguration) ?? { sensors: getProjectTypeTemplate(session.project.projectType.key)?.sensors ?? [] };
    const devices = await prisma.device.findMany({ where: { id: { in: cfg.deviceIds }, protocol: "SIMULATED", status: { not: "DISABLED" } }, select: { id: true, name: true, deviceIdentifier: true, projectId: true, protocol: true, status: true } });
    const disconnected = new Set(cfg.scenario === "DISCONNECT" ? (cfg.disconnectDeviceIds.length ? cfg.disconnectDeviceIds : devices.slice(0, 1).map((d) => d.id)) : []);
    const dropped = new Set(cfg.scenario === "SENSOR_DROPOUT" ? (cfg.dropSensorKeys.length ? cfg.dropSensorKeys : configuration.sensors.slice(0, 1).map((s) => s.key)) : []);

    for (const device of devices) {
      if (disconnected.has(device.id)) continue; // silent device → heartbeat timeout → OFFLINE
      const sims = await simulatorsFor(session.id, device, configuration);
      const abnormal = isAbnormalTick(cfg.scenario as Scenario, device.id, tickIndex);
      const payload = {
        messageId: `sim:${session.id.slice(0, 8)}:${tickIndex}`,
        timestamp: now.toISOString(),
        readings: [...sims.entries()].filter(([key]) => !dropped.has(key)).map(([sensorKey, sim]) => ({ sensorKey, value: sim.next(now, abnormal) })),
      };
      try {
        const res = await ingestTelemetry(device, payload, "SIMULATED", now);
        readings += res.accepted;
      } catch (err) {
        logger.warn({ err, deviceId: device.id, sessionId: session.id }, "simulated ingestion failed");
      }
    }
    await prisma.simulationSession.update({ where: { id: session.id }, data: { lastTickAt: now, tickCount: { increment: 1 }, readingsCount: { increment: readings } } });
  }
  return { sessions: sessions.length, readings };
}

/**
 * Backfills historical demonstration data for a project's simulated devices. Rows are inserted
 * directly (labelled SIMULATED, quality.backfill) and do not trigger alerts, because they describe the past.
 */
export async function generateHistory(projectId: string, opts: { hours: number; intervalMinutes: number; deviceCount?: number; abnormalTailMinutes?: number; seed?: string }) {
  if (opts.hours <= 0 || opts.hours > 24 * 31) throw badRequest("History is limited to 31 days");
  if (opts.intervalMinutes < 1) throw badRequest("Interval must be at least 1 minute");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { configuration: true } });
  const configuration = project.configuration as unknown as ProjectConfiguration;
  const devices = await ensureSimulatedDevices(projectId, opts.deviceCount ?? 2);
  const deviceRows = await prisma.device.findMany({ where: { id: { in: devices.map((d) => d.id) } }, include: { sensors: true } });

  const end = new Date();
  end.setSeconds(0, 0);
  const steps = Math.floor((opts.hours * 60) / opts.intervalMinutes);
  let total = 0;
  for (const device of deviceRows) {
    const sims = buildDeviceSimulators(`${opts.seed ?? "history"}:${device.deviceIdentifier}`, configuration.sensors);
    const sensorByKey = new Map(device.sensors.map((s) => [s.sensorKey, s]));
    let batch: Prisma.TelemetryReadingCreateManyInput[] = [];
    for (let i = steps; i >= 0; i--) {
      const t = new Date(end.getTime() - i * opts.intervalMinutes * 60_000);
      const abnormal = opts.abnormalTailMinutes !== undefined && i * opts.intervalMinutes < opts.abnormalTailMinutes;
      for (const [key, sim] of sims) {
        const sensor = sensorByKey.get(key);
        if (!sensor) continue;
        const value = sim.next(t, abnormal);
        const min = sensor.minValue?.toNumber();
        const max = sensor.maxValue?.toNumber();
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) continue;
        batch.push({ projectId, deviceId: device.id, sensorId: sensor.id, value, unit: sensor.unit, occurredAt: t, receivedAt: t, source: "SIMULATED", messageId: `hist:${t.getTime()}`, qualityMetadata: { backfill: true } });
      }
      if (batch.length >= 2000) {
        total += (await prisma.telemetryReading.createMany({ data: batch, skipDuplicates: true })).count;
        batch = [];
      }
    }
    if (batch.length) total += (await prisma.telemetryReading.createMany({ data: batch, skipDuplicates: true })).count;
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: end, status: "ONLINE" } });
    if (device.status !== "ONLINE") await prisma.deviceStatusEvent.create({ data: { deviceId: device.id, previousStatus: device.status, newStatus: "ONLINE", reason: "Historical simulation data generated", occurredAt: end } });
  }
  return { devices: deviceRows.length, readings: total };
}
