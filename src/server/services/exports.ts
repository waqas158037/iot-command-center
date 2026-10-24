import { prisma } from "@/lib/db";
import { toCsv, type CsvValue } from "@/lib/exports/csv";
import { alertReport, deviceReport, energyReport, MEASUREMENT_GROUPS, sensorStatistics } from "./reports";

export const EXPORT_KINDS = ["telemetry", "devices", "alerts", "sensor-stats", "energy"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const MAX_EXPORT_ROWS = 50_000;

interface Scope {
  projectIds: string[];
  from: Date;
  to: Date;
  deviceId?: string;
  sensorType?: string;
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export async function buildExport(kind: ExportKind, scope: Scope, group?: string | null): Promise<{ filename: string; csv: string; rows: number }> {
  const meta: CsvValue[][] = [];
  let headers: string[] = [];
  let rows: CsvValue[][] = [];

  switch (kind) {
    case "telemetry": {
      const readings = await prisma.telemetryReading.findMany({
        where: { projectId: { in: scope.projectIds }, occurredAt: { gte: scope.from, lte: scope.to }, ...(scope.deviceId ? { deviceId: scope.deviceId } : {}), ...(scope.sensorType ? { sensor: { sensorType: scope.sensorType } } : {}) },
        orderBy: { occurredAt: "asc" },
        take: MAX_EXPORT_ROWS,
        select: { occurredAt: true, receivedAt: true, value: true, unit: true, source: true, messageId: true, project: { select: { projectCode: true } }, device: { select: { deviceIdentifier: true, name: true } }, sensor: { select: { sensorKey: true, name: true, sensorType: true, origin: true } } },
      });
      headers = ["occurred_at_utc", "received_at_utc", "project", "device_identifier", "device_name", "sensor_key", "sensor_name", "measurement", "origin", "value", "unit", "source", "simulated", "message_id"];
      rows = readings.map((r) => [r.occurredAt, r.receivedAt, r.project.projectCode, r.device.deviceIdentifier, r.device.name, r.sensor.sensorKey, r.sensor.name, r.sensor.sensorType, r.sensor.origin, r.value.toNumber(), r.unit, r.source, r.source === "SIMULATED", r.messageId]);
      break;
    }
    case "devices": {
      const devices = await deviceReport(scope);
      headers = ["project", "device_identifier", "name", "protocol", "status", "hardware_model", "firmware", "location", "sensors", "readings_in_period", "availability_pct", "status_changes", "last_seen_utc", "simulated"];
      rows = devices.map((d) => [d.project.projectCode, d.deviceIdentifier, d.name, d.protocol, d.status, d.hardwareModel, d.firmwareVersion, d.locationDescription, d._count.sensors, d.readings, d.availability === null ? null : Math.round(d.availability * 1000) / 10, d.statusChanges, d.lastSeenAt, d.protocol === "SIMULATED"]);
      break;
    }
    case "alerts": {
      const report = await alertReport(scope);
      headers = ["created_at_utc", "project", "device", "sensor", "title", "severity", "status", "triggering_value", "unit", "occurrences", "acknowledged_at_utc", "resolved_at_utc", "simulated"];
      rows = report.items.map((a) => [a.createdAt, a.project.name, a.device?.name, a.sensor?.name, a.title, a.severity, a.status, a.triggeringValue?.toNumber() ?? null, a.sensor?.unit, a.occurrenceCount, a.acknowledgedAt, a.resolvedAt, a.isSimulated]);
      break;
    }
    case "sensor-stats": {
      const stats = await sensorStatistics(scope, group && group in MEASUREMENT_GROUPS ? MEASUREMENT_GROUPS[group as keyof typeof MEASUREMENT_GROUPS] : undefined);
      headers = ["project", "device", "sensor", "measurement", "origin", "unit", "count", "min", "max", "mean", "stddev", "first_utc", "last_utc", "hourly_completeness_pct", "simulated"];
      rows = stats.map((s) => [s.projectName, s.deviceName, s.sensorName, s.sensorType, s.origin, s.unit, s.count, s.min, s.max, s.avg, s.stddev, s.firstAt, s.lastAt, Math.round(s.completeness * 1000) / 10, s.isSimulated]);
      break;
    }
    case "energy": {
      const energy = await energyReport(scope);
      headers = ["meter", "consumption_kwh", "estimated_cost", "currency"];
      rows = energy.bySensor.map((s) => [s.label, Math.round(s.kwh * 1000) / 1000, s.cost === null ? null : Math.round(s.cost * 100) / 100, s.currency]);
      meta.push(["# Consumption = sum of positive deltas of cumulative kWh meter readings; power (W) is not summed."]);
      break;
    }
  }
  meta.unshift([`# IoT Command Center ${kind} export`], [`# Generated ${new Date().toISOString()} for ${scope.from.toISOString()} to ${scope.to.toISOString()} (UTC)`]);
  if (rows.length >= MAX_EXPORT_ROWS) meta.push([`# Truncated to the first ${MAX_EXPORT_ROWS} rows; narrow the date range for a complete export.`]);
  const preamble = meta.map((m) => m.join("")).join("\r\n") + "\r\n";
  return { filename: `${kind}-${stamp()}.csv`, csv: preamble + toCsv(headers, rows), rows: rows.length };
}
