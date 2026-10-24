import { Prisma, type DeviceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/http/errors";
import { canOnProject, type Actor, type ProjectAction } from "@/lib/permissions/policies";
import type { ProjectConfiguration } from "@/lib/project-types/types";

export const reportFilterSchema = z.object({
  projectId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  deviceId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  sensorType: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(64).optional()),
  from: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
  to: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const MEASUREMENT_GROUPS = {
  environmental: ["temperature", "humidity", "pressure", "pm25", "pm10", "co2", "co", "no2", "wind_speed", "wind_direction", "rainfall", "solar_irradiance", "smoke_level"],
  agricultural: ["soil_moisture", "soil_ph", "tank_level", "water_flow", "temperature", "humidity", "light"],
  health: ["glucose", "heart_rate", "spo2", "body_temperature", "systolic_bp", "diastolic_bp", "fall_event", "dose_dispensed", "dose_missed"],
} as const;

interface Scope {
  projectIds: string[];
  from: Date;
  to: Date;
  deviceId?: string;
  sensorType?: string;
}

/** Projects the actor may run this report on (all accessible projects, or the one requested). */
export async function resolveReportScope(actor: Actor, filter: ReportFilter, action: ProjectAction = "report.view"): Promise<Scope> {
  const to = filter.to ?? new Date();
  const from = filter.from ?? new Date(to.getTime() - 7 * 86400_000);
  if (from >= to) throw badRequest("'from' must be before 'to'");
  if (to.getTime() - from.getTime() > 400 * 86400_000) throw badRequest("Reports are limited to 400 days");

  const projects = await prisma.project.findMany({
    where: {
      ...(filter.projectId ? { id: filter.projectId } : {}),
      ...(actor.role === "SUPER_ADMIN" ? {} : { members: { some: { userId: actor.id } } }),
    },
    select: { id: true, archivedAt: true, projectType: { select: { isSensitive: true } }, members: { where: { userId: actor.id }, select: { projectRole: true } } },
  });
  if (filter.projectId && projects.length === 0) throw notFound("Project");
  const allowed = projects.filter((p) => canOnProject(actor, action, { membershipRole: p.members[0]?.projectRole ?? null, isSensitive: p.projectType.isSensitive, isArchived: p.archivedAt !== null }));
  if (filter.projectId && allowed.length === 0) throw forbidden();

  if (filter.deviceId) {
    const d = await prisma.device.findUnique({ where: { id: filter.deviceId }, select: { projectId: true } });
    if (!d || !allowed.some((p) => p.id === d.projectId)) throw notFound("Device");
  }
  return { projectIds: allowed.map((p) => p.id), from, to, deviceId: filter.deviceId, sensorType: filter.sensorType };
}

const uuidList = (ids: string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

// ── Overview ──────────────────────────────────────────────

export async function projectOverviewReport(scope: Scope) {
  if (scope.projectIds.length === 0) return [];
  const projects = await prisma.project.findMany({
    where: { id: { in: scope.projectIds } },
    select: { id: true, name: true, projectCode: true, status: true, projectType: { select: { name: true, category: true } }, _count: { select: { devices: true, members: true } } },
    orderBy: { name: "asc" },
  });
  const [online, readings, alerts] = await Promise.all([
    prisma.device.groupBy({ by: ["projectId"], where: { projectId: { in: scope.projectIds }, status: { in: ["ONLINE", "DEGRADED"] } }, _count: { _all: true } }),
    prisma.telemetryReading.groupBy({ by: ["projectId"], where: { projectId: { in: scope.projectIds }, occurredAt: { gte: scope.from, lte: scope.to } }, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ["projectId"], where: { projectId: { in: scope.projectIds }, createdAt: { gte: scope.from, lte: scope.to } }, _count: { _all: true } }),
  ]);
  const m = <T extends { projectId: string; _count: { _all: number } }>(rows: T[]) => new Map(rows.map((r) => [r.projectId, r._count._all]));
  const onlineMap = m(online), readingsMap = m(readings), alertMap = m(alerts);
  return projects.map((p) => ({
    ...p,
    onlineDevices: onlineMap.get(p.id) ?? 0,
    readings: readingsMap.get(p.id) ?? 0,
    alerts: alertMap.get(p.id) ?? 0,
  }));
}

// ── Devices & availability ──────────────────────────────────────────────

/**
 * Availability = share of the period the device was ONLINE or DEGRADED, reconstructed from
 * DeviceStatusEvent transitions. The status at the start of the window is the last transition
 * before it; time before the device existed is excluded.
 */
export function computeAvailability(events: { newStatus: DeviceStatus; occurredAt: Date }[], initial: DeviceStatus | null, from: Date, to: Date, createdAt: Date) {
  const start = createdAt > from ? createdAt : from;
  if (start >= to) return null;
  let status: DeviceStatus | null = initial;
  let cursor = start.getTime();
  let up = 0;
  for (const e of events) {
    const t = Math.min(Math.max(e.occurredAt.getTime(), cursor), to.getTime());
    if (status === "ONLINE" || status === "DEGRADED") up += t - cursor;
    cursor = t;
    status = e.newStatus;
  }
  if (status === "ONLINE" || status === "DEGRADED") up += to.getTime() - cursor;
  return up / (to.getTime() - start.getTime());
}

export async function deviceReport(scope: Scope) {
  if (scope.projectIds.length === 0) return [];
  const devices = await prisma.device.findMany({
    where: { projectId: { in: scope.projectIds }, ...(scope.deviceId ? { id: scope.deviceId } : {}) },
    select: {
      id: true, name: true, deviceIdentifier: true, protocol: true, status: true, hardwareModel: true, firmwareVersion: true, lastSeenAt: true, createdAt: true, locationDescription: true,
      project: { select: { name: true, projectCode: true } },
      _count: { select: { sensors: true } },
    },
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
    take: 1000,
  });
  const ids = devices.map((d) => d.id);
  const [events, before, readingCounts] = await Promise.all([
    prisma.deviceStatusEvent.findMany({ where: { deviceId: { in: ids }, occurredAt: { gte: scope.from, lte: scope.to } }, orderBy: { occurredAt: "asc" }, select: { deviceId: true, newStatus: true, occurredAt: true } }),
    ids.length
      ? prisma.$queryRaw<{ deviceId: string; newStatus: DeviceStatus }[]>`
          SELECT DISTINCT ON ("deviceId") "deviceId", "newStatus" FROM "DeviceStatusEvent"
          WHERE "deviceId" IN (${uuidList(ids)}) AND "occurredAt" < ${scope.from}
          ORDER BY "deviceId", "occurredAt" DESC`
      : [],
    prisma.telemetryReading.groupBy({ by: ["deviceId"], where: { deviceId: { in: ids }, occurredAt: { gte: scope.from, lte: scope.to } }, _count: { _all: true } }),
  ]);
  const beforeMap = new Map(before.map((b) => [b.deviceId, b.newStatus]));
  const countMap = new Map(readingCounts.map((r) => [r.deviceId, r._count._all]));
  return devices.map((d) => {
    const evs = events.filter((e) => e.deviceId === d.id);
    const availability = computeAvailability(evs, beforeMap.get(d.id) ?? null, scope.from, scope.to, d.createdAt);
    return { ...d, availability, statusChanges: evs.length, readings: countMap.get(d.id) ?? 0 };
  });
}

// ── Sensor statistics ──────────────────────────────────────────────

export interface SensorStat {
  sensorId: string;
  sensorName: string;
  sensorType: string;
  unit: string;
  origin: string;
  deviceName: string;
  projectName: string;
  isSimulated: boolean;
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  stddev: number | null;
  firstAt: Date | null;
  lastAt: Date | null;
  /** Share of hours in the window containing at least one reading. */
  completeness: number;
}

export async function sensorStatistics(scope: Scope, sensorTypes?: readonly string[]): Promise<SensorStat[]> {
  if (scope.projectIds.length === 0) return [];
  const types = scope.sensorType ? [scope.sensorType] : sensorTypes;
  const rows = await prisma.$queryRaw<
    { sensorId: string; sensorName: string; sensorType: string; unit: string; origin: string; deviceName: string; projectName: string; protocol: string; count: bigint; min: number | null; max: number | null; avg: number | null; stddev: number | null; firstAt: Date | null; lastAt: Date | null; hours: bigint }[]
  >`
    SELECT s.id AS "sensorId", s.name AS "sensorName", s."sensorType", s.unit, s.origin::text AS origin,
           d.name AS "deviceName", p.name AS "projectName", d.protocol::text AS protocol,
           count(r.id) AS count, min(r.value)::float8 AS min, max(r.value)::float8 AS max,
           avg(r.value)::float8 AS avg, stddev_samp(r.value)::float8 AS stddev,
           min(r."occurredAt") AS "firstAt", max(r."occurredAt") AS "lastAt",
           count(DISTINCT date_trunc('hour', r."occurredAt")) AS hours
    FROM "Sensor" s
    JOIN "Device" d ON d.id = s."deviceId"
    JOIN "Project" p ON p.id = d."projectId"
    LEFT JOIN "TelemetryReading" r ON r."sensorId" = s.id AND r."occurredAt" BETWEEN ${scope.from} AND ${scope.to}
    WHERE d."projectId" IN (${uuidList(scope.projectIds)})
      ${scope.deviceId ? Prisma.sql`AND d.id = ${scope.deviceId}::uuid` : Prisma.empty}
      ${types && types.length ? Prisma.sql`AND s."sensorType" IN (${Prisma.join([...types])})` : Prisma.empty}
    GROUP BY s.id, d.id, p.id
    ORDER BY p.name, d.name, s.name
    LIMIT 2000`;
  const totalHours = Math.max(1, Math.ceil((scope.to.getTime() - scope.from.getTime()) / 3600_000));
  return rows.map((r) => ({
    sensorId: r.sensorId, sensorName: r.sensorName, sensorType: r.sensorType, unit: r.unit, origin: r.origin, deviceName: r.deviceName, projectName: r.projectName,
    isSimulated: r.protocol === "SIMULATED", count: Number(r.count), min: r.min, max: r.max, avg: r.avg, stddev: r.stddev, firstAt: r.firstAt, lastAt: r.lastAt,
    completeness: Math.min(1, Number(r.hours) / totalHours),
  }));
}

// ── Alerts ──────────────────────────────────────────────

export async function alertReport(scope: Scope) {
  if (scope.projectIds.length === 0) return { bySeverity: [], byStatus: [], byRule: [], daily: [], mttaMinutes: null, mttrMinutes: null, items: [] };
  const where: Prisma.AlertWhereInput = { projectId: { in: scope.projectIds }, createdAt: { gte: scope.from, lte: scope.to }, ...(scope.deviceId ? { deviceId: scope.deviceId } : {}) };
  const [bySeverity, byStatus, byRule, items, timings, daily] = await Promise.all([
    prisma.alert.groupBy({ by: ["severity"], where, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ["alertRuleId"], where, _count: { _all: true }, orderBy: { _count: { alertRuleId: "desc" } }, take: 10 }),
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, title: true, severity: true, status: true, isSimulated: true, triggeringValue: true, occurrenceCount: true, createdAt: true, acknowledgedAt: true, resolvedAt: true, project: { select: { name: true } }, device: { select: { name: true } }, sensor: { select: { name: true, unit: true } } },
    }),
    prisma.$queryRaw<{ mtta: number | null; mttr: number | null }[]>`
      SELECT avg(extract(epoch FROM ("acknowledgedAt" - "createdAt")) / 60)::float8 AS mtta,
             avg(extract(epoch FROM ("resolvedAt" - "createdAt")) / 60)::float8 AS mttr
      FROM "Alert" WHERE "projectId" IN (${uuidList(scope.projectIds)}) AND "createdAt" BETWEEN ${scope.from} AND ${scope.to}`,
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*) AS count FROM "Alert"
      WHERE "projectId" IN (${uuidList(scope.projectIds)}) AND "createdAt" BETWEEN ${scope.from} AND ${scope.to}
      GROUP BY 1 ORDER BY 1`,
  ]);
  const ruleIds = byRule.map((r) => r.alertRuleId).filter(Boolean) as string[];
  const rules = await prisma.alertRule.findMany({ where: { id: { in: ruleIds } }, select: { id: true, name: true, project: { select: { name: true } } } });
  return {
    bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count._all })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    byRule: byRule.map((r) => {
      const rule = rules.find((x) => x.id === r.alertRuleId);
      return { ruleId: r.alertRuleId, name: rule?.name ?? "Deleted rule", project: rule?.project.name ?? "", count: r._count._all };
    }),
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), count: Number(d.count) })),
    mttaMinutes: timings[0]?.mtta ?? null,
    mttrMinutes: timings[0]?.mttr ?? null,
    items,
  };
}

// ── Energy ──────────────────────────────────────────────

/**
 * Energy consumption from cumulative kWh meter registers: the sum of positive deltas between
 * consecutive readings, bucketed by day. Meter resets (negative deltas) are ignored rather than
 * subtracted. Instantaneous power (W) is never summed as energy.
 */
export async function energyReport(scope: Scope) {
  if (scope.projectIds.length === 0) return { daily: [], bySensor: [], totalKwh: 0, tariffs: [] };
  const rows = await prisma.$queryRaw<{ day: Date; sensorId: string; sensorName: string; deviceName: string; projectId: string; projectName: string; kwh: number }[]>`
    WITH ordered AS (
      SELECT r."sensorId", r."occurredAt", r."projectId",
             r.value - lag(r.value) OVER (PARTITION BY r."sensorId" ORDER BY r."occurredAt") AS delta
      FROM "TelemetryReading" r
      JOIN "Sensor" s ON s.id = r."sensorId"
      WHERE s."sensorType" = 'energy'
        AND r."projectId" IN (${uuidList(scope.projectIds)})
        ${scope.deviceId ? Prisma.sql`AND r."deviceId" = ${scope.deviceId}::uuid` : Prisma.empty}
        AND r."occurredAt" BETWEEN ${scope.from} AND ${scope.to}
    )
    SELECT date_trunc('day', o."occurredAt") AS day, o."sensorId", s.name AS "sensorName", d.name AS "deviceName",
           o."projectId", p.name AS "projectName", sum(greatest(o.delta, 0))::float8 AS kwh
    FROM ordered o
    JOIN "Sensor" s ON s.id = o."sensorId" JOIN "Device" d ON d.id = s."deviceId" JOIN "Project" p ON p.id = o."projectId"
    WHERE o.delta IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY 1`;
  const projects = await prisma.project.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.projectId))] } }, select: { id: true, name: true, configuration: true } });
  const tariffs = projects.map((p) => {
    const s = (p.configuration as unknown as ProjectConfiguration).settings ?? {};
    return { projectId: p.id, projectName: p.name, tariffPerKwh: typeof s.tariffPerKwh === "number" ? s.tariffPerKwh : null, currency: typeof s.currency === "string" ? s.currency : null };
  });
  const dailyMap = new Map<string, number>();
  const sensorMap = new Map<string, { sensorId: string; label: string; projectId: string; kwh: number }>();
  for (const r of rows) {
    const day = r.day.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + r.kwh);
    const cur = sensorMap.get(r.sensorId) ?? { sensorId: r.sensorId, label: `${r.projectName} · ${r.deviceName}`, projectId: r.projectId, kwh: 0 };
    cur.kwh += r.kwh;
    sensorMap.set(r.sensorId, cur);
  }
  const bySensor = [...sensorMap.values()].map((s) => {
    const t = tariffs.find((x) => x.projectId === s.projectId);
    return { ...s, cost: t?.tariffPerKwh != null ? s.kwh * t.tariffPerKwh : null, currency: t?.currency ?? null };
  });
  return {
    daily: [...dailyMap.entries()].map(([day, kwh]) => ({ day, kwh })),
    bySensor,
    totalKwh: bySensor.reduce((a, b) => a + b.kwh, 0),
    tariffs,
  };
}

// ── Simulator activity ──────────────────────────────────────────────

export async function simulatorReport(scope: Scope) {
  if (scope.projectIds.length === 0) return { sessions: [], daily: [] };
  const [sessions, daily] = await Promise.all([
    prisma.simulationSession.findMany({
      where: { projectId: { in: scope.projectIds }, startedAt: { lte: scope.to }, OR: [{ stoppedAt: null }, { stoppedAt: { gte: scope.from } }] },
      orderBy: { startedAt: "desc" },
      take: 200,
      include: { project: { select: { name: true } }, startedBy: { select: { name: true } } },
    }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "occurredAt") AS day, count(*) AS count FROM "TelemetryReading"
      WHERE source = 'SIMULATED' AND "projectId" IN (${uuidList(scope.projectIds)}) AND "occurredAt" BETWEEN ${scope.from} AND ${scope.to}
      GROUP BY 1 ORDER BY 1`,
  ]);
  return { sessions, daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), count: Number(d.count) })) };
}
