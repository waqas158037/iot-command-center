import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { publishEvent } from "@/lib/realtime/events";
import { computeDeviceStatus } from "@/lib/telemetry/device-status";
import { evaluateDeviceOffline } from "./alert-engine";

/** Marks devices OFFLINE once their heartbeat timeout passes and raises DEVICE_OFFLINE alerts. */
export async function runDeviceHealthCheck(now = new Date()) {
  const defaultTimeout = env().DEVICE_HEARTBEAT_TIMEOUT_SECONDS;
  const candidates = await prisma.device.findMany({
    where: { status: { in: ["ONLINE", "DEGRADED"] }, lastSeenAt: { not: null }, project: { archivedAt: null } },
    select: { id: true, name: true, projectId: true, protocol: true, status: true, lastSeenAt: true, heartbeatTimeoutSec: true },
    take: 5000,
  });
  let changed = 0;
  for (const d of candidates) {
    const next = computeDeviceStatus({ current: d.status, lastSeenAt: d.lastSeenAt, timeoutSeconds: d.heartbeatTimeoutSec ?? defaultTimeout, now });
    if (next !== "OFFLINE") continue;
    // Conditional update so a heartbeat that raced in is not overwritten.
    const res = await prisma.device.updateMany({ where: { id: d.id, status: d.status, lastSeenAt: d.lastSeenAt }, data: { status: "OFFLINE" } });
    if (res.count === 0) continue;
    changed++;
    await prisma.deviceStatusEvent.create({ data: { deviceId: d.id, previousStatus: d.status, newStatus: "OFFLINE", reason: `No heartbeat for ${d.heartbeatTimeoutSec ?? defaultTimeout}s`, occurredAt: now } });
    await publishEvent({ type: "device_status", projectId: d.projectId, deviceId: d.id, status: "OFFLINE", previousStatus: d.status });
    await evaluateDeviceOffline(d, true);
  }
  return changed;
}
