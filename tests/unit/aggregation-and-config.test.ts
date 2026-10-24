import { describe, expect, it } from "vitest";
import { chooseBucket, fillBuckets } from "@/server/services/telemetry-query";
import { computeAvailability } from "@/server/services/reports";
import { PROJECT_TYPES, buildDefaultConfiguration } from "@/lib/project-types/registry";
import { settingsSchemaFor, validateConfiguration } from "@/lib/project-types/config";
import { SensorSimulator } from "@/lib/simulator/generator";

const t = (iso: string) => new Date(iso);

describe("time-series aggregation", () => {
  it("returns raw data for short ranges and bounded buckets for long ones", () => {
    expect(chooseBucket(t("2026-01-01T00:00:00Z"), t("2026-01-01T02:00:00Z"), "auto")).toBe("raw");
    expect(chooseBucket(t("2026-01-01T00:00:00Z"), t("2026-01-02T00:00:00Z"), "auto")).toBe("15m");
    expect(chooseBucket(t("2026-01-01T00:00:00Z"), t("2026-01-31T00:00:00Z"), "auto")).toBe("6h");
    expect(chooseBucket(t("2026-01-01T00:00:00Z"), t("2026-01-02T00:00:00Z"), "1h")).toBe("1h");
  });
  it("fills empty buckets with nulls so gaps stay visible", () => {
    const filled = fillBuckets([{ t: "2026-01-01T00:00:00.000Z", avg: 1, min: 1, max: 1, count: 1 }, { t: "2026-01-01T00:20:00.000Z", avg: 3, min: 3, max: 3, count: 1 }], t("2026-01-01T00:00:00Z"), t("2026-01-01T00:20:00Z"), 600);
    expect(filled.map((p) => p.avg)).toEqual([1, null, 3]);
  });
});

describe("availability", () => {
  const from = t("2026-01-01T00:00:00Z"), to = t("2026-01-01T10:00:00Z");
  it("computes the online share from transitions", () => {
    const a = computeAvailability([{ newStatus: "OFFLINE", occurredAt: t("2026-01-01T04:00:00Z") }, { newStatus: "ONLINE", occurredAt: t("2026-01-01T06:00:00Z") }], "ONLINE", from, to, t("2025-12-01T00:00:00Z"));
    expect(a).toBeCloseTo(0.8, 6);
  });
  it("excludes time before the device existed and treats unknown as down", () => {
    expect(computeAvailability([{ newStatus: "ONLINE", occurredAt: t("2026-01-01T05:00:00Z") }], null, from, to, t("2026-01-01T00:00:00Z"))).toBeCloseTo(0.5, 6);
    expect(computeAvailability([], "ONLINE", from, to, t("2026-01-01T05:00:00Z"))).toBe(1);
    expect(computeAvailability([], null, from, to, t("2026-02-01T00:00:00Z"))).toBeNull();
  });
});

describe("project-type templates", () => {
  it("defines 16 project types with unique keys", () => {
    expect(PROJECT_TYPES).toHaveLength(16);
    expect(new Set(PROJECT_TYPES.map((p) => p.key)).size).toBe(16);
  });
  it.each(PROJECT_TYPES.map((p) => [p.key, p] as const))("%s has a valid configuration", (_key, type) => {
    const config = buildDefaultConfiguration(type);
    expect(validateConfiguration(config)).toEqual([]);
    expect(type.sensors.length).toBeGreaterThan(0);
    expect(type.widgets.length).toBeGreaterThan(0);
    // Analytics must be described honestly: no type claims a trained model it does not have.
    expect(["Rule-based", "Statistical analysis", "Threshold monitoring"]).toContain(type.analyticsLabel);
    expect(type.analyticsNote.toLowerCase()).not.toMatch(/\b(ai|model) (detects|predicts|diagnoses|learns)\b/);
    if (type.isSensitive) expect(type.safetyNotice).toBeTruthy();
  });
  it("detects widgets that mix units and duplicate sensors", () => {
    const base = buildDefaultConfiguration(PROJECT_TYPES[0]);
    const broken = { ...base, sensors: [...base.sensors, base.sensors[0]], widgets: [{ id: "w", type: "line" as const, title: "x", sensorKeys: [base.sensors[0].key, "missing"] }] };
    const errors = validateConfiguration(broken);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown sensor"))).toBe(true);
  });
  it("validates per-project settings against the type's schema", () => {
    const schema = settingsSchemaFor([{ key: "tariff", label: "Tariff", type: "number", default: 1, min: 0, max: 10 }, { key: "mode", label: "Mode", type: "select", default: "a", options: ["a", "b"] }]);
    expect(schema.safeParse({ tariff: "2.5", mode: "b" }).success).toBe(true);
    expect(schema.safeParse({ tariff: 11, mode: "a" }).success).toBe(false);
    expect(schema.safeParse({ tariff: 1, mode: "c" }).success).toBe(false);
    expect(schema.safeParse({ tariff: 1, mode: "a", extra: 1 }).success).toBe(false);
  });
});

describe("simulator", () => {
  it("is deterministic for the same seed", () => {
    const profile = { mode: "wave" as const, base: 20, amplitude: 3, noise: 0.5, periodMinutes: 60, abnormal: 45 };
    const a = new SensorSimulator(profile, "seed"), b = new SensorSimulator(profile, "seed");
    const times = [0, 1, 2].map((m) => new Date(Date.UTC(2026, 0, 1, 0, m)));
    expect(times.map((x) => a.next(x))).toEqual(times.map((x) => b.next(x)));
  });
  it("moves into the abnormal range when asked", () => {
    const sim = new SensorSimulator({ mode: "wave", base: 20, amplitude: 1, noise: 0.1, periodMinutes: 60, abnormal: 50 }, "x");
    expect(sim.next(new Date(), true)).toBeGreaterThan(45);
  });
  it("never decreases cumulative counters", () => {
    const sim = new SensorSimulator({ mode: "counter", start: 100, ratePerHour: 1, abnormalRatePerHour: 5 }, "c");
    let prev = 0;
    for (let i = 0; i < 20; i++) {
      const v = sim.next(new Date(Date.UTC(2026, 0, 1, i)));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
