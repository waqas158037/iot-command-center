import { describe, expect, it } from "vitest";
import { computeDeviceStatus, isStale } from "@/lib/telemetry/device-status";

const now = new Date("2026-05-01T12:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe("device status", () => {
  it("is unknown until the first heartbeat", () => {
    expect(computeDeviceStatus({ current: "UNKNOWN", lastSeenAt: null, timeoutSeconds: 120, now })).toBe("UNKNOWN");
  });
  it("is online within the timeout and offline after it", () => {
    expect(computeDeviceStatus({ current: "UNKNOWN", lastSeenAt: ago(119), timeoutSeconds: 120, now })).toBe("ONLINE");
    expect(computeDeviceStatus({ current: "ONLINE", lastSeenAt: ago(120), timeoutSeconds: 120, now })).toBe("ONLINE");
    expect(computeDeviceStatus({ current: "ONLINE", lastSeenAt: ago(121), timeoutSeconds: 120, now })).toBe("OFFLINE");
  });
  it("keeps disabled devices disabled", () => {
    expect(computeDeviceStatus({ current: "DISABLED", lastSeenAt: ago(1), timeoutSeconds: 120, now })).toBe("DISABLED");
  });
  it("reports degraded health when told, and keeps it without new information", () => {
    expect(computeDeviceStatus({ current: "ONLINE", lastSeenAt: ago(1), timeoutSeconds: 120, now, degraded: true })).toBe("DEGRADED");
    expect(computeDeviceStatus({ current: "DEGRADED", lastSeenAt: ago(1), timeoutSeconds: 120, now })).toBe("DEGRADED");
    expect(computeDeviceStatus({ current: "DEGRADED", lastSeenAt: ago(1), timeoutSeconds: 120, now, degraded: false })).toBe("ONLINE");
  });
  it("detects stale readings", () => {
    expect(isStale(null, 60, now)).toBe(true);
    expect(isStale(ago(30), 60, now)).toBe(false);
    expect(isStale(ago(90).toISOString(), 60, now)).toBe(true);
  });
});
