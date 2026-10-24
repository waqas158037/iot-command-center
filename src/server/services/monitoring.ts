import { Prisma, type ProjectCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/http/errors";
import type { Actor } from "@/lib/permissions/policies";
import { accessibleProjectIds } from "./access";
import { BUCKETS, chooseBucket } from "./telemetry-query";

export interface DashboardFilter {
  projectId?: string;
  category?: ProjectCategory;
  deviceId?: string;
  sensorType?: string;
  from?: Date;
  to?: Date;
}

/** Every figure on the dashboard comes from these database queries over the actor's projects. */
export async function dashboardSummary(actor: Actor, filter: DashboardFilter) {
  const to = filter.to ?? new Date();
  const from = filter.from ?? new Date(to.getTime() - 24 * 3600_000);
  const ids = await accessibleProjectIds(actor);
  if (filter.projectId && ids && !ids.includes(filter.projectId)) throw notFound("Project");

  const projectWhere: Prisma.ProjectWhereInput = {
    ...(filter.projectId ? { id: filter.projectId } : ids ? { id: { in: ids } } : {}),
    ...(filter.category ? { projectType: { category: filter.category } } : {}),
  };
  const projects = await prisma.project.findMany({ where: projectWhere, select: { id: true, name: true, status: true, archivedAt: true, projectCode: true } });
  const projectIds = projects.map((p) => p.id);
  const deviceWhere: Prisma.DeviceWhereInput = { projectId: { in: projectIds }, ...(filter.deviceId ? { id: filter.deviceId } : {}) };

  const [deviceStatus, alertCounts, readingCount, simulatedCount, severityDist, sensorActivity, projectAlerts, projectDevices] = await Promise.all([
    prisma.device.groupBy({ by: ["status"], where: deviceWhere, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ["severity"], where: { projectId: { in: projectIds }, status: { not: "RESOLVED" }, ...(filter.deviceId ? { deviceId: filter.deviceId } : {}) }, _count: { _all: true } }),
    prisma.telemetryReading.count({ where: { projectId: { in: projectIds }, occurredAt: { gte: from, lte: to }, ...(filter.deviceId ? { deviceId: filter.deviceId } : {}) } }),
    prisma.telemetryReading.count({ where: { projectId: { in: projectIds }, occurredAt: { gte: from, lte: to }, source: "SIMULATED", ...(filter.deviceId ? { deviceId: filter.deviceId } : {}) } }),
    prisma.alert.groupBy({ by: ["severity"], where: { projectId: { in: projectIds }, createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    projectIds.length
      ? prisma.$queryRaw<{ sensorType: string; count: bigint }[]>`
          SELECT s."sensorType", count(*) AS count FROM "TelemetryReading" r JOIN "Sensor" s ON s.id = r."sensorId"
          WHERE r."projectId" IN (${Prisma.join(projectIds.map((id) => Prisma.sql`${id}::uuid`))}) AND r."occurredAt" BETWEEN ${from} AND ${to}
          ${filter.deviceId ? Prisma.sql`AND r."deviceId" = ${filter.deviceId}::uuid` : Prisma.empty}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
      : [],
    prisma.alert.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, status: { not: "RESOLVED" } }, _count: { _all: true } }),
    prisma.device.groupBy({ by: ["projectId", "status"], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
  ]);

  // Readings over time, split hardware vs simulated, server-side bucketed.
  const bucketKey = chooseBucket(from, to, "auto");
  const bucketSeconds = bucketKey === "raw" ? 300 : BUCKETS[bucketKey];
  const timeline = projectIds.length
    ? await prisma.$queryRaw<{ bucket: Date; simulated: bigint; hardware: bigint }[]>`
        SELECT date_bin(make_interval(secs => ${bucketSeconds}), "occurredAt", TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
               count(*) FILTER (WHERE source = 'SIMULATED') AS simulated,
               count(*) FILTER (WHERE source <> 'SIMULATED') AS hardware
        FROM "TelemetryReading"
        WHERE "projectId" IN (${Prisma.join(projectIds.map((id) => Prisma.sql`${id}::uuid`))}) AND "occurredAt" BETWEEN ${from} AND ${to}
        ${filter.deviceId ? Prisma.sql`AND "deviceId" = ${filter.deviceId}::uuid` : Prisma.empty}
        GROUP BY 1 ORDER BY 1`
    : [];

  const statusCount = (s: string) => deviceStatus.find((d) => d.status === s)?._count._all ?? 0;
  const totalDevices = deviceStatus.reduce((a, b) => a + b._count._all, 0);
  const openAlerts = alertCounts.reduce((a, b) => a + b._count._all, 0);

  const health = projects
    .filter((p) => !p.archivedAt)
    .map((p) => {
      const devs = projectDevices.filter((d) => d.projectId === p.id);
      const total = devs.reduce((a, b) => a + b._count._all, 0);
      const online = devs.filter((d) => d.status === "ONLINE" || d.status === "DEGRADED").reduce((a, b) => a + b._count._all, 0);
      const alerts = projectAlerts.find((a) => a.projectId === p.id)?._count._all ?? 0;
      return { projectId: p.id, name: p.name, projectCode: p.projectCode, totalDevices: total, onlineDevices: online, openAlerts: alerts };
    })
    .sort((a, b) => b.openAlerts - a.openAlerts || a.name.localeCompare(b.name));

  const [recentAlerts, recentStatus] = await Promise.all([
    prisma.alert.findMany({ where: { projectId: { in: projectIds } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, severity: true, status: true, isSimulated: true, createdAt: true, project: { select: { name: true } } } }),
    prisma.deviceStatusEvent.findMany({ where: { device: { projectId: { in: projectIds } } }, orderBy: { occurredAt: "desc" }, take: 8, select: { id: true, newStatus: true, previousStatus: true, reason: true, occurredAt: true, device: { select: { id: true, name: true, protocol: true, project: { select: { name: true } } } } } }),
  ]);

  return {
    range: { from: from.toISOString(), to: to.toISOString(), bucketSeconds },
    kpis: {
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
      registeredDevices: totalDevices,
      onlineDevices: statusCount("ONLINE") + statusCount("DEGRADED"),
      offlineDevices: statusCount("OFFLINE"),
      unknownDevices: statusCount("UNKNOWN"),
      disabledDevices: statusCount("DISABLED"),
      activeAlerts: openAlerts,
      criticalAlerts: alertCounts.find((a) => a.severity === "CRITICAL")?._count._all ?? 0,
      telemetryEvents: readingCount,
      simulatedEvents: simulatedCount,
    },
    deviceStatus: deviceStatus.map((d) => ({ status: d.status, count: d._count._all })),
    severity: severityDist.map((s) => ({ severity: s.severity, count: s._count._all })),
    sensorActivity: sensorActivity.map((s) => ({ sensorType: s.sensorType, count: Number(s.count) })),
    timeline: timeline.map((t) => ({ t: t.bucket.toISOString(), simulated: Number(t.simulated), hardware: Number(t.hardware) })),
    health,
    recentAlerts,
    recentStatus,
  };
}
