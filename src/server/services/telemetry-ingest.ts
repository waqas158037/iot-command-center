import type { DeviceStatus, Prisma, TelemetrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { conflict, unauthenticated } from "@/lib/http/errors";
import { safeEqualHex, sha256Hex } from "@/lib/crypto";
import { logger } from "@/lib/logging/logger";
import { publishEvent } from "@/lib/realtime/events";
import { decideReading, type SensorInfo } from "@/lib/telemetry/ingest-policy";
import { ingestPayloadSchema, type IngestPayload } from "@/lib/validation/schemas";
import { evaluateDeviceOffline, evaluateTelemetryAlerts, type EvaluatedSensor } from "./alert-engine";

export interface IngestDevice {
  id: string;
  name: string;
  deviceIdentifier: string;
  projectId: string;
  protocol: string;
  status: DeviceStatus;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: { sensorKey: string; reason: string }[];
  deviceStatus: DeviceStatus;
}

/**
 * Authenticates a device by its identifier and secret. Only non-revoked, unexpired credentials
 * match; comparison is constant-time on the SHA-256 digest.
 */
export async function authenticateDevice(deviceIdentifier: string, secret: string): Promise<IngestDevice> {
  if (!deviceIdentifier || !secret || secret.length > 200) throw unauthenticated("Invalid device credentials");
  const device = await prisma.device.findUnique({
    where: { deviceIdentifier },
    select: { id: true, name: true, deviceIdentifier: true, projectId: true, protocol: true, status: true, credentials: { where: { revokedAt: null }, select: { id: true, credentialHash: true, expiresAt: true } } },
  });
  const digest = sha256Hex(secret);
  const now = new Date();
  const match = device?.credentials.find((c) => (!c.expiresAt || c.expiresAt > now) && safeEqualHex(c.credentialHash, digest));
  if (!device || !match) throw unauthenticated("Invalid device credentials");
  if (device.status === "DISABLED") throw unauthenticated("Device is disabled");
  // Throttle lastUsedAt writes to at most once a minute per credential.
  await prisma.deviceCredential.updateMany({ where: { id: match.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }] }, data: { lastUsedAt: now } });
  // Credential hashes never leave this function.
  const { credentials, ...rest } = device;
  void credentials;
  return rest;
}

const DEGRADED_BATTERY_PCT = 10;

/**
 * The single ingestion pipeline used by HTTP, MQTT and the simulator:
 * validate → map to sensors → apply late/duplicate/unit/range policy → persist idempotently
 * → update connectivity → evaluate alerts → publish realtime event.
 */
export async function ingestTelemetry(device: IngestDevice, rawPayload: unknown, source: TelemetrySource, receivedAt = new Date()): Promise<IngestResult> {
  const payload: IngestPayload = ingestPayloadSchema.parse(rawPayload);
  if (device.status === "DISABLED") throw unauthenticated("Device is disabled");
  if (source === "SIMULATED" && device.protocol !== "SIMULATED") throw conflict("Simulated readings can only target simulated devices");
  if (source !== "SIMULATED" && device.protocol === "SIMULATED") throw conflict("This device is simulated and does not accept hardware telemetry");

  const project = await prisma.project.findUnique({ where: { id: device.projectId }, select: { archivedAt: true } });
  if (!project || project.archivedAt) throw conflict("The device's project is archived and no longer accepts telemetry");

  const sensors = await prisma.sensor.findMany({
    where: { deviceId: device.id },
    select: { id: true, sensorKey: true, sensorType: true, unit: true, name: true, isActive: true, minValue: true, maxValue: true },
  });
  const latest = await prisma.telemetryReading.groupBy({ by: ["sensorId"], where: { deviceId: device.id }, _max: { occurredAt: true } });
  const latestMap = new Map(latest.map((l) => [l.sensorId, l._max.occurredAt]));
  const byKey = new Map<string, SensorInfo & { name: string }>(
    sensors.map((s) => [
      s.sensorKey,
      { id: s.id, sensorKey: s.sensorKey, sensorType: s.sensorType, unit: s.unit, name: s.name, isActive: s.isActive, minValue: s.minValue?.toNumber() ?? null, maxValue: s.maxValue?.toNumber() ?? null, latestOccurredAt: latestMap.get(s.id) ?? null },
    ]),
  );

  const e = env();
  const limits = { now: receivedAt, maxLateSeconds: e.TELEMETRY_MAX_LATE_SECONDS, maxFutureSkewSeconds: e.TELEMETRY_MAX_FUTURE_SKEW_SECONDS };
  const messageTime = payload.timestamp ? new Date(payload.timestamp) : receivedAt;
  const rejected: { sensorKey: string; reason: string }[] = [];
  const rows: Prisma.TelemetryReadingCreateManyInput[] = [];
  const freshBySensor = new Map<string, { sensor: SensorInfo & { name: string }; value: number; occurredAt: Date }>();
  const seenKeys = new Set<string>();

  for (const r of payload.readings) {
    if (seenKeys.has(r.sensorKey)) {
      rejected.push({ sensorKey: r.sensorKey, reason: "duplicate_sensor_in_message" });
      continue;
    }
    seenKeys.add(r.sensorKey);
    const decision = decideReading({ sensorKey: r.sensorKey, value: r.value, unit: r.unit, occurredAt: r.timestamp ? new Date(r.timestamp) : messageTime }, byKey.get(r.sensorKey), limits);
    if (!decision.ok) {
      rejected.push({ sensorKey: decision.sensorKey, reason: decision.reason });
      continue;
    }
    rows.push({
      projectId: device.projectId,
      deviceId: device.id,
      sensorId: decision.sensor.id,
      value: decision.value,
      unit: decision.unit,
      occurredAt: decision.occurredAt,
      receivedAt,
      source,
      messageId: payload.messageId ?? null,
      qualityMetadata: (decision.quality ?? undefined) as Prisma.InputJsonValue | undefined,
    });
    if (!decision.outOfOrder) freshBySensor.set(decision.sensor.id, { sensor: byKey.get(r.sensorKey)!, value: decision.value, occurredAt: decision.occurredAt });
  }

  const inserted = rows.length
    ? await prisma.telemetryReading.createManyAndReturn({ data: rows, skipDuplicates: true, select: { sensorId: true } })
    : [];
  const insertedSensorIds = new Set(inserted.map((i) => i.sensorId));
  const duplicates = rows.length - inserted.length;

  // Connectivity: any authenticated message is a heartbeat, even if all readings were duplicates.
  const batteryValue = [...freshBySensor.values()].find((f) => f.sensor.sensorType === "battery")?.value;
  const statusValue = [...freshBySensor.values()].find((f) => f.sensor.sensorType === "device_status")?.value;
  const degraded = (batteryValue !== undefined && batteryValue < DEGRADED_BATTERY_PCT) || (statusValue !== undefined && statusValue >= 1) || (rejected.length > 0 && inserted.length === 0 && duplicates === 0);
  const newStatus: DeviceStatus = degraded ? "DEGRADED" : "ONLINE";
  const previous = device.status;
  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: receivedAt, status: newStatus } });
  if (previous !== newStatus) {
    await prisma.deviceStatusEvent.create({ data: { deviceId: device.id, previousStatus: previous, newStatus, reason: degraded ? "Device reported degraded health" : "Telemetry received", occurredAt: receivedAt } });
    await publishEvent({ type: "device_status", projectId: device.projectId, deviceId: device.id, status: newStatus, previousStatus: previous });
    if (previous === "OFFLINE" || previous === "UNKNOWN") await evaluateDeviceOffline(device, false);
  }

  // Alerts only consider newly stored, in-order readings so replays and backfills cannot re-fire them.
  const evaluatedSensors: EvaluatedSensor[] = [...freshBySensor.values()]
    .filter((f) => insertedSensorIds.has(f.sensor.id))
    .map((f) => ({ id: f.sensor.id, sensorKey: f.sensor.sensorKey, sensorType: f.sensor.sensorType, name: f.sensor.name, unit: f.sensor.unit, value: f.value }));
  try {
    await evaluateTelemetryAlerts({ projectId: device.projectId, deviceId: device.id, deviceName: device.name, sensors: evaluatedSensors, isSimulated: source === "SIMULATED" });
  } catch (err) {
    logger.error({ err, deviceId: device.id }, "alert evaluation failed after ingestion");
  }

  if (inserted.length) {
    await publishEvent({
      type: "telemetry",
      projectId: device.projectId,
      deviceId: device.id,
      source,
      receivedAt: receivedAt.toISOString(),
      readings: rows
        .filter((r) => insertedSensorIds.has(r.sensorId))
        .map((r) => ({ sensorId: r.sensorId, sensorKey: sensors.find((s) => s.id === r.sensorId)!.sensorKey, value: Number(r.value), unit: r.unit, occurredAt: new Date(r.occurredAt as Date).toISOString() })),
    });
  }

  if (rejected.length) logger.info({ deviceId: device.id, rejected }, "telemetry readings rejected");
  return { accepted: inserted.length, duplicates, rejected, deviceStatus: newStatus };
}
