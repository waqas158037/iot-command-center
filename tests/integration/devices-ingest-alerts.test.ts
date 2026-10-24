import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ZodError } from "zod";
import { AppError } from "@/lib/http/errors";
import { sha256Hex } from "@/lib/crypto";
import { POST as ingestRoute } from "@/app/api/ingest/telemetry/route";
import { createDevice, createSensor, deleteDevice, getDevice, revokeDeviceCredentials, rotateDeviceCredential, updateDevice } from "@/server/services/devices";
import { actOnAlert, createAlertRule, listAlerts } from "@/server/services/alerts";
import { ingestTelemetry } from "@/server/services/telemetry-ingest";
import { runDeviceHealthCheck } from "@/server/services/device-health";
import { buildExport } from "@/server/services/exports";
import { resolveReportScope } from "@/server/services/reports";
import { ingestRequest, world } from "./helpers";

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (err) {
    if (err instanceof AppError) return err.status;
    if (err instanceof ZodError) return 400; // the HTTP layer maps validation errors to 400
    throw err;
  }
};
const post = async (id: string, secret: string, body: unknown) => {
  const res = await ingestRoute(new NextRequest(ingestRequest(id, secret, body)), { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
};

let w: Awaited<ReturnType<typeof world>>;
let secret: string;
let identifier: string;
beforeAll(async () => {
  w = await world();
  secret = w.http.secret!;
  identifier = w.http.device.deviceIdentifier;
});

describe("device registration", () => {
  it("starts UNKNOWN, creates template sensors and stores only a hash of the secret", async () => {
    const d = await getDevice(w.manager, w.http.device.id);
    expect(d.status).toBe("UNKNOWN");
    expect(d._count.sensors).toBeGreaterThan(0);
    expect(secret).toMatch(/^icc_dev_/);
    const creds = await prisma.deviceCredential.findMany({ where: { deviceId: d.id } });
    expect(creds).toHaveLength(1);
    expect(creds[0].credentialHash).toBe(sha256Hex(secret));
    expect(JSON.stringify(d)).not.toContain(secret);
    expect(JSON.stringify(d)).not.toContain(creds[0].credentialHash);
  });

  it("rejects duplicate identifiers", async () => {
    expect(await status(createDevice(w.manager, { projectId: w.project.id, name: "Dup", protocol: "HTTP", deviceIdentifier: identifier }))).toBe(409);
  });

  it("limits engineers to configuration changes", async () => {
    expect(await status(updateDevice(w.engineer, w.http.device.id, { firmwareVersion: "1.2.3" }))).toBe(200);
    expect(await status(updateDevice(w.engineer, w.http.device.id, { name: "Renamed" }))).toBe(403);
    expect(await status(updateDevice(w.viewer, w.http.device.id, { firmwareVersion: "9" }))).toBe(403);
  });

  it("adds custom sensors with canonical units", async () => {
    const s = await createSensor(w.manager, w.http.device.id, { sensorKey: "ambient_f", name: "Ambient", sensorType: "temperature", minValue: -40, maxValue: 85 });
    expect(s.unit).toBe("°C");
    expect(await status(createSensor(w.manager, w.http.device.id, { sensorKey: "ambient_f", name: "Again", sensorType: "temperature" }))).toBe(409);
  });
});

describe("HTTP ingestion", () => {
  it("accepts valid telemetry and marks the device online", async () => {
    const r = await post(identifier, secret, { messageId: "msg-1", readings: [{ sensorKey: "pm25", value: 12 }, { sensorKey: "ambient_f", value: 68, unit: "°F" }] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ accepted: 2, duplicates: 0, deviceStatus: "ONLINE" });
    const reading = await prisma.telemetryReading.findFirstOrThrow({ where: { deviceId: w.http.device.id, sensor: { sensorKey: "ambient_f" } } });
    expect(reading.value.toNumber()).toBeCloseTo(20, 6);
    expect(reading.source).toBe("HTTP");
  });

  it("ignores duplicate messages idempotently", async () => {
    const r = await post(identifier, secret, { messageId: "msg-1", readings: [{ sensorKey: "pm25", value: 12 }] });
    expect(r.body).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(await prisma.telemetryReading.count({ where: { deviceId: w.http.device.id, messageId: "msg-1" } })).toBe(2);
  });

  it("rejects invalid payloads, credentials and sensors", async () => {
    expect((await post(identifier, "icc_dev_wrong", { readings: [{ sensorKey: "pm25", value: 1 }] })).status).toBe(401);
    expect((await post(identifier, secret, "{not json")).status).toBe(400);
    expect((await post(identifier, secret, { readings: [] })).status).toBe(400);
    const partial = await post(identifier, secret, { readings: [{ sensorKey: "pm25", value: 5 }, { sensorKey: "nope", value: 1 }] });
    expect(partial.status).toBe(200);
    expect(partial.body.rejected).toEqual([{ sensorKey: "nope", reason: "unknown_sensor" }]);
    const none = await post(identifier, secret, { readings: [{ sensorKey: "pm25", value: -1 }] });
    expect(none.status).toBe(400);
  });

  it("cannot write to another device's sensors", async () => {
    const other = await createDevice(w.outsider, { projectId: w.other.id, name: "Lock", protocol: "HTTP" });
    const before = await prisma.telemetryReading.count({ where: { deviceId: other.device.id } });
    const r = await post(identifier, secret, { readings: [{ sensorKey: "lock_state", value: 1 }] });
    expect(r.status).toBe(400);
    expect(await prisma.telemetryReading.count({ where: { deviceId: other.device.id } })).toBe(before);
  });
});

describe("credential rotation and revocation", () => {
  it("invalidates the old secret immediately without a grace period", async () => {
    const d = await createDevice(w.manager, { projectId: w.project.id, name: "Rotating", protocol: "HTTP" });
    const old = d.secret!;
    const rotated = await rotateDeviceCredential(w.manager, d.device.id, {});
    expect((await post(d.device.deviceIdentifier, old, { readings: [{ sensorKey: "pm25", value: 3 }] })).status).toBe(401);
    expect((await post(d.device.deviceIdentifier, rotated.secret, { readings: [{ sensorKey: "pm25", value: 3 }] })).status).toBe(200);
    await revokeDeviceCredentials(w.manager, d.device.id);
    expect((await post(d.device.deviceIdentifier, rotated.secret, { readings: [{ sensorKey: "pm25", value: 3 }] })).status).toBe(401);
    expect(await status(rotateDeviceCredential(w.engineer, d.device.id, {}))).toBe(403);
  });

  it("keeps the old secret during a grace period", async () => {
    const d = await createDevice(w.manager, { projectId: w.project.id, name: "Grace", protocol: "HTTP" });
    await rotateDeviceCredential(w.manager, d.device.id, { graceMinutes: 30 });
    expect((await post(d.device.deviceIdentifier, d.secret!, { readings: [{ sensorKey: "pm25", value: 3 }] })).status).toBe(200);
  });

  it("refuses to delete devices with history but allows deactivation", async () => {
    expect(await status(deleteDevice(w.manager, w.http.device.id))).toBe(409);
    const fresh = await createDevice(w.manager, { projectId: w.project.id, name: "Unused", protocol: "MQTT" });
    expect(await status(deleteDevice(w.manager, fresh.device.id))).toBe(200);
  });
});

describe("alerts", () => {
  let deviceId: string;
  beforeAll(async () => {
    const d = await createDevice(w.manager, { projectId: w.project.id, name: "Alerting node", protocol: "HTTP" });
    deviceId = d.device.id;
    await createAlertRule(w.manager, { projectId: w.project.id, deviceId, name: "Test PM spike", conditionType: "THRESHOLD_ABOVE", sensorType: "pm25", thresholdConfiguration: { value: 100 }, severity: "HIGH", consecutiveCount: 2, cooldownSeconds: 600, autoResolve: true });
  });
  const send = async (value: number, offset: number) => {
    const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
    return ingestTelemetry(device, { timestamp: new Date(Date.now() + offset * 1000).toISOString(), readings: [{ sensorKey: "pm25", value }] }, "HTTP");
  };
  const open = () => prisma.alert.findMany({ where: { deviceId, title: { startsWith: "Test PM spike" }, status: { not: "RESOLVED" } } });

  it("needs consecutive violations, then deduplicates while open", async () => {
    await send(150, 0);
    expect(await open()).toHaveLength(0);
    await send(160, 1);
    expect(await open()).toHaveLength(1);
    await send(170, 2);
    const alerts = await open();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].occurrenceCount).toBe(2);
    const notifications = await prisma.notification.count({ where: { userId: w.manager.id, dedupeKey: { endsWith: alerts[0].id } } });
    expect(notifications).toBe(1);
    expect(await prisma.notification.count({ where: { userId: w.outsider.id } })).toBe(0);
  });

  it("supports acknowledge and resolve with audit and events, by permitted roles only", async () => {
    const [alert] = await open();
    expect(await status(actOnAlert(w.viewer, alert.id, { action: "acknowledge" }))).toBe(403);
    expect(await status(actOnAlert(w.outsider, alert.id, { action: "acknowledge" }))).toBe(404);
    await actOnAlert(w.engineer, alert.id, { action: "acknowledge", notes: "Checked the filter" });
    expect(await status(actOnAlert(w.engineer, alert.id, { action: "acknowledge" }))).toBe(409);
    await actOnAlert(w.engineer, alert.id, { action: "resolve" });
    const events = await prisma.alertEvent.findMany({ where: { alertId: alert.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.eventType)).toEqual(["TRIGGERED", "ACKNOWLEDGED", "RESOLVED"]);
    expect(await prisma.auditLog.count({ where: { resourceId: alert.id, action: { in: ["alert.acknowledge", "alert.resolve"] } } })).toBe(2);
  });

  it("respects the cooldown after resolution", async () => {
    await send(180, 3);
    await send(190, 4);
    expect(await open()).toHaveLength(0);
  });

  it("lists alerts with pagination", async () => {
    const page = await listAlerts(w.manager, { projectId: w.project.id, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(1);
  });
});

describe("device health", () => {
  it("marks silent devices offline and raises the offline rule", async () => {
    const d = await createDevice(w.manager, { projectId: w.project.id, name: "Goes quiet", protocol: "HTTP", heartbeatTimeoutSec: 30 });
    await post(d.device.deviceIdentifier, d.secret!, { readings: [{ sensorKey: "pm25", value: 4 }] });
    await runDeviceHealthCheck(new Date(Date.now() + 120_000));
    const device = await prisma.device.findUniqueOrThrow({ where: { id: d.device.id } });
    expect(device.status).toBe("OFFLINE");
    expect(await prisma.deviceStatusEvent.count({ where: { deviceId: d.device.id, newStatus: "OFFLINE" } })).toBe(1);
    expect(await prisma.alert.count({ where: { deviceId: d.device.id, rule: { conditionType: "DEVICE_OFFLINE" } } })).toBe(1);
  });
});

describe("exports", () => {
  it("exports only permitted projects and sanitizes formulas", async () => {
    await prisma.device.update({ where: { id: w.http.device.id }, data: { locationDescription: "=HYPERLINK(\"http://evil\")" } });
    const scope = await resolveReportScope(w.manager, {}, "report.export");
    expect(scope.projectIds).toEqual([w.project.id]);
    const { csv } = await buildExport("devices", scope);
    expect(csv).toContain("'=HYPERLINK");
    expect(await status(resolveReportScope(w.viewer, { projectId: w.project.id }, "report.export"))).toBe(403);
  });
});
