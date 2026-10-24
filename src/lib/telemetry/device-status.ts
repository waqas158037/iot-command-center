import type { DeviceStatus } from "@prisma/client";

/**
 * Connectivity is derived only from heartbeats/telemetry (lastSeenAt), never from the record existing.
 *  - DISABLED stays DISABLED.
 *  - Never seen → UNKNOWN.
 *  - Seen within the timeout → ONLINE (or DEGRADED if the latest message reported problems).
 *  - Otherwise OFFLINE.
 */
export function computeDeviceStatus(input: { current: DeviceStatus; lastSeenAt: Date | null; timeoutSeconds: number; now: Date; degraded?: boolean }): DeviceStatus {
  if (input.current === "DISABLED") return "DISABLED";
  if (!input.lastSeenAt) return "UNKNOWN";
  const age = input.now.getTime() - input.lastSeenAt.getTime();
  if (age > input.timeoutSeconds * 1000) return "OFFLINE";
  // Without fresh degradation info (e.g. the periodic health check), keep the last known health.
  const degraded = input.degraded ?? input.current === "DEGRADED";
  return degraded ? "DEGRADED" : "ONLINE";
}

export function isStale(occurredAt: Date | string | null | undefined, timeoutSeconds: number, now = new Date()): boolean {
  if (!occurredAt) return true;
  return now.getTime() - new Date(occurredAt).getTime() > timeoutSeconds * 1000;
}
