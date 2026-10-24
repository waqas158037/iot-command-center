import { describe, expect, it } from "vitest";
import { isViolation, meetsConsecutive, openKeyFor, severityAtLeast, withinCooldown, describeCondition } from "@/lib/telemetry/alert-logic";

describe("threshold boundaries", () => {
  it("treats above/below as strict", () => {
    expect(isViolation("THRESHOLD_ABOVE", { value: 30 }, 30)).toBe(false);
    expect(isViolation("THRESHOLD_ABOVE", { value: 30 }, 30.01)).toBe(true);
    expect(isViolation("THRESHOLD_BELOW", { value: 10 }, 10)).toBe(false);
    expect(isViolation("THRESHOLD_BELOW", { value: 10 }, 9.99)).toBe(true);
  });
  it("treats ranges as inclusive", () => {
    expect(isViolation("OUTSIDE_RANGE", { min: 18, max: 26 }, 18)).toBe(false);
    expect(isViolation("OUTSIDE_RANGE", { min: 18, max: 26 }, 26)).toBe(false);
    expect(isViolation("OUTSIDE_RANGE", { min: 18, max: 26 }, 26.1)).toBe(true);
    expect(isViolation("INSIDE_RANGE", { min: 0, max: 5 }, 5)).toBe(true);
    expect(isViolation("INSIDE_RANGE", { min: 0, max: 5 }, 5.1)).toBe(false);
  });
  it("handles states, battery and non-finite values", () => {
    expect(isViolation("STATE_EQUALS", { state: 2 }, 2.2)).toBe(true);
    expect(isViolation("STATE_EQUALS", { state: 2 }, 1)).toBe(false);
    expect(isViolation("BATTERY_LOW", { value: 15 }, 14)).toBe(true);
    expect(isViolation("THRESHOLD_ABOVE", { value: 1 }, Number.NaN)).toBe(false);
    expect(isViolation("THRESHOLD_ABOVE", {}, 100)).toBe(false);
    expect(isViolation("DEVICE_OFFLINE", {}, 1)).toBe(false);
  });
});

describe("consecutive readings", () => {
  it("requires the newest N readings to all violate", () => {
    expect(meetsConsecutive("THRESHOLD_ABOVE", { value: 50 }, [60, 61, 40], 2)).toBe(true);
    expect(meetsConsecutive("THRESHOLD_ABOVE", { value: 50 }, [60, 40, 61], 2)).toBe(false);
    expect(meetsConsecutive("THRESHOLD_ABOVE", { value: 50 }, [60], 2)).toBe(false);
    expect(meetsConsecutive("THRESHOLD_ABOVE", { value: 50 }, [60], 0)).toBe(true);
  });
});

describe("cooldown, severity and dedupe keys", () => {
  const now = new Date("2026-01-01T00:10:00Z");
  it("suppresses re-alerting during cooldown only", () => {
    expect(withinCooldown(new Date("2026-01-01T00:08:00Z"), 300, now)).toBe(true);
    expect(withinCooldown(new Date("2026-01-01T00:04:00Z"), 300, now)).toBe(false);
    expect(withinCooldown(null, 300, now)).toBe(false);
    expect(withinCooldown(new Date("2026-01-01T00:09:59Z"), 0, now)).toBe(false);
  });
  it("orders severities", () => {
    expect(severityAtLeast("CRITICAL", "HIGH")).toBe(true);
    expect(severityAtLeast("LOW", "MEDIUM")).toBe(false);
    expect(severityAtLeast("MEDIUM", "MEDIUM")).toBe(true);
  });
  it("builds one open key per rule, device and sensor", () => {
    expect(openKeyFor("r", "d", "s")).toBe("r:d:s");
    expect(openKeyFor("r", null, null)).toBe("r:-:-");
  });
  it("describes conditions in plain words", () => {
    expect(describeCondition("THRESHOLD_ABOVE", { value: 30 }, "°C")).toBe("above 30 °C");
    expect(describeCondition("MISSING_READINGS", { missingSeconds: 600 })).toBe("no readings for 600s");
  });
});
