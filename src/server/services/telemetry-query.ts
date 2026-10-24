import { Prisma, type TelemetrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/http/errors";
import { telemetryQuerySchema } from "@/lib/validation/schemas";
import type { Actor } from "@/lib/permissions/policies";
import type { z } from "zod";
import { accessibleProjectIds, assertDeviceAction, assertProjectAction, assertSensorAction } from "./access";

export const BUCKETS = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400 } as const;
export type BucketKey = keyof typeof BUCKETS;

/**
 * Chooses an aggregation interval so a chart needs at most ~150 points (coarse enough that
 * devices reporting every few minutes fill consecutive buckets instead of alternating with gaps).
 * Ranges up to 3 hours are returned raw (bounded by `limit`).
 */
export function chooseBucket(from: Date, to: Date, requested: string): BucketKey | "raw" {
  if (requested !== "auto") return requested as BucketKey | "raw";
  const seconds = (to.getTime() - from.getTime()) / 1000;
  if (seconds <= 3 * 3600) return "raw";
  for (const key of ["1m", "5m", "15m", "1h", "6h", "1d"] as BucketKey[]) {
    if (seconds / BUCKETS[key] <= 150) return key;
  }
  return "1d";
}

export interface SeriesPoint {
  t: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface Series {
  sensorId: string;
  sensorKey: string;
  name: string;
  sensorType: string;
  unit: string;
  deviceId: string;
  deviceName: string;
  isSimulated: boolean;
  points: SeriesPoint[];
}

/** Inserts null points for empty buckets so charts show gaps instead of interpolating over missing data. */
export function fillBuckets(points: SeriesPoint[], from: Date, to: Date, bucketSeconds: number): SeriesPoint[] {
  const ms = bucketSeconds * 1000;
  const start = Math.floor(from.getTime() / ms) * ms;
  const byTime = new Map(points.map((p) => [new Date(p.t).getTime(), p]));
  const out: SeriesPoint[] = [];
  for (let t = start; t <= to.getTime() && out.length < 5000; t += ms) {
    out.push(byTime.get(t) ?? { t: new Date(t).toISOString(), avg: null, min: null, max: null, count: 0 });
  }
  return out;
}

async function resolveSensorScope(actor: Actor, q: z.infer<typeof telemetryQuerySchema>) {
  if (q.sensorId) {
    await assertSensorAction(actor, q.sensorId, "telemetry.view");
    return { sensorIds: [q.sensorId] };
  }
  if (q.deviceId) {
    await assertDeviceAction(actor, q.deviceId, "telemetry.view");
    const sensors = await prisma.sensor.findMany({ where: { deviceId: q.deviceId }, select: { id: true }, take: 100 });
    return { sensorIds: sensors.map((s) => s.id) };
  }
  if (q.projectId) {
    await assertProjectAction(actor, q.projectId, "telemetry.view");
    const sensors = await prisma.sensor.findMany({ where: { device: { projectId: q.projectId } }, select: { id: true }, take: 200 });
    return { sensorIds: sensors.map((s) => s.id) };
  }
  throw badRequest("Specify sensorId, deviceId or projectId");
}

export async function telemetryHistory(actor: Actor, query: z.input<typeof telemetryQuerySchema>): Promise<{ bucket: string; from: string; to: string; series: Series[] }> {
  const q = telemetryQuerySchema.parse(query);
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 24 * 3600 * 1000);
  if (from >= to) throw badRequest("'from' must be before 'to'");
  if (to.getTime() - from.getTime() > 400 * 86400_000) throw badRequest("Date range is limited to 400 days");

  const { sensorIds } = await resolveSensorScope(actor, q);
  if (sensorIds.length === 0) return { bucket: "raw", from: from.toISOString(), to: to.toISOString(), series: [] };
  return querySeries(sensorIds, from, to, chooseBucket(from, to, q.bucket), q.limit);
}

export async function querySeries(sensorIds: string[], from: Date, to: Date, bucket: BucketKey | "raw", limit = 500) {
  const meta = await prisma.sensor.findMany({
    where: { id: { in: sensorIds } },
    select: { id: true, sensorKey: true, name: true, sensorType: true, unit: true, device: { select: { id: true, name: true, protocol: true } } },
  });
  const seriesMap = new Map<string, Series>(
    meta.map((m) => [m.id, { sensorId: m.id, sensorKey: m.sensorKey, name: m.name, sensorType: m.sensorType, unit: m.unit, deviceId: m.device.id, deviceName: m.device.name, isSimulated: m.device.protocol === "SIMULATED", points: [] }]),
  );

  if (bucket === "raw") {
    // Newest `limit` readings per request, returned in chronological order.
    const rows = await prisma.telemetryReading.findMany({
      where: { sensorId: { in: sensorIds }, occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: "desc" },
      take: Math.min(limit * Math.max(1, sensorIds.length), 20000),
      select: { sensorId: true, value: true, occurredAt: true },
    });
    for (const r of rows.reverse()) {
      const v = r.value.toNumber();
      seriesMap.get(r.sensorId)?.points.push({ t: r.occurredAt.toISOString(), avg: v, min: v, max: v, count: 1 });
    }
  } else {
    const seconds = BUCKETS[bucket];
    const rows = await prisma.$queryRaw<{ sensorId: string; bucket: Date; avg: number; min: number; max: number; count: bigint }[]>`
      SELECT "sensorId",
             date_bin(make_interval(secs => ${seconds}), "occurredAt", TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
             avg("value")::float8 AS avg, min("value")::float8 AS min, max("value")::float8 AS max, count(*) AS count
      FROM "TelemetryReading"
      WHERE "sensorId" IN (${Prisma.join(sensorIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND "occurredAt" >= ${from} AND "occurredAt" <= ${to}
      GROUP BY 1, 2
      ORDER BY 2`;
    for (const r of rows) seriesMap.get(r.sensorId)?.points.push({ t: r.bucket.toISOString(), avg: r.avg, min: r.min, max: r.max, count: Number(r.count) });
    for (const s of seriesMap.values()) s.points = fillBuckets(s.points, from, to, seconds);
  }
  return { bucket, from: from.toISOString(), to: to.toISOString(), series: [...seriesMap.values()] };
}

export interface LatestReading {
  sensorId: string;
  value: number;
  unit: string;
  occurredAt: string;
  receivedAt: string;
  source: TelemetrySource;
}

/** Latest reading per sensor using PostgreSQL DISTINCT ON over the (sensorId, occurredAt) index. */
export async function latestReadingsForSensors(sensorIds: string[]): Promise<Map<string, LatestReading>> {
  if (sensorIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ sensorId: string; value: number; unit: string; occurredAt: Date; receivedAt: Date; source: TelemetrySource }[]>`
    SELECT DISTINCT ON ("sensorId") "sensorId", "value"::float8 AS value, "unit", "occurredAt", "receivedAt", "source"
    FROM "TelemetryReading"
    WHERE "sensorId" IN (${Prisma.join(sensorIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "sensorId", "occurredAt" DESC`;
  return new Map(rows.map((r) => [r.sensorId, { sensorId: r.sensorId, value: r.value, unit: r.unit, occurredAt: r.occurredAt.toISOString(), receivedAt: r.receivedAt.toISOString(), source: r.source }]));
}

export async function deviceLatest(actor: Actor, deviceId: string) {
  await assertDeviceAction(actor, deviceId, "telemetry.view");
  const sensors = await prisma.sensor.findMany({ where: { deviceId }, select: { id: true, sensorKey: true, name: true, sensorType: true, unit: true, origin: true, isActive: true, configuration: true, minValue: true, maxValue: true } });
  const latest = await latestReadingsForSensors(sensors.map((s) => s.id));
  return sensors.map((s) => ({ ...s, latest: latest.get(s.id) ?? null }));
}

/** Paginated raw readings for tables and CSV export, newest first, always within an authorized scope. */
export async function rawReadings(actor: Actor, query: z.input<typeof telemetryQuerySchema> & { page?: number; pageSize?: number }) {
  const q = telemetryQuerySchema.parse(query);
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 24 * 3600 * 1000);
  let where: Prisma.TelemetryReadingWhereInput;
  if (q.sensorId || q.deviceId || q.projectId) {
    const { sensorIds } = await resolveSensorScope(actor, q);
    where = { sensorId: { in: sensorIds } };
  } else {
    const ids = await accessibleProjectIds(actor);
    where = ids ? { projectId: { in: ids } } : {};
  }
  where = { ...where, occurredAt: { gte: from, lte: to } };
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, query.pageSize ?? 50));
  const [items, total] = await Promise.all([
    prisma.telemetryReading.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, value: true, unit: true, occurredAt: true, receivedAt: true, source: true, messageId: true, qualityMetadata: true,
        sensor: { select: { id: true, name: true, sensorKey: true, sensorType: true } },
        device: { select: { id: true, name: true, deviceIdentifier: true } },
        project: { select: { id: true, name: true, projectCode: true } },
      },
    }),
    prisma.telemetryReading.count({ where }),
  ]);
  return { items: items.map((i) => ({ ...i, id: i.id.toString(), value: i.value.toNumber() })), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
