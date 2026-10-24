import { describe, expect, it } from "vitest";
import { formatMeasurementValue, MEASUREMENTS, toCanonicalUnit } from "@/lib/telemetry/measurements";
import { decideReading, type SensorInfo } from "@/lib/telemetry/ingest-policy";

describe("unit conversion", () => {
  it("converts to canonical units", () => {
    const f = toCanonicalUnit("temperature", 77, "°F");
    expect(f.ok && f.value).toBeCloseTo(25, 6);
    const g = toCanonicalUnit("glucose", 5.5, "mmol/L");
    expect(g.ok && g.value).toBeCloseTo(99.1, 1);
    const kw = toCanonicalUnit("power", 1.5, "kW");
    expect(kw.ok && kw.value).toBe(1500);
  });
  it("accepts a missing unit as canonical and rejects unknown units", () => {
    const r = toCanonicalUnit("temperature", 20);
    expect(r.ok && r.value).toBe(20);
    expect(toCanonicalUnit("temperature", 20, "kg").ok).toBe(false);
  });
  it("formats state measurements with labels", () => {
    const stateKey = Object.values(MEASUREMENTS).find((m) => m.kind === "STATE" && m.stateLabels)!;
    const [code, label] = Object.entries(stateKey.stateLabels!)[0];
    expect(formatMeasurementValue(stateKey.key, Number(code))).toBe(label);
    expect(formatMeasurementValue("temperature", null)).toBe("—");
  });
});

describe("ingestion policy", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  const limits = { now, maxLateSeconds: 7 * 86400, maxFutureSkewSeconds: 300 };
  const sensor: SensorInfo = { id: "s1", sensorKey: "temperature", sensorType: "temperature", unit: "°C", isActive: true, minValue: -40, maxValue: 85, latestOccurredAt: new Date("2026-05-01T11:59:00Z") };

  it("accepts a valid reading", () => {
    const d = decideReading({ sensorKey: "temperature", value: 21, occurredAt: now }, sensor, limits);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.quality).toBeNull();
  });
  it("rejects unknown, disabled, out-of-range and bad-unit readings", () => {
    expect(decideReading({ sensorKey: "x", value: 1, occurredAt: now }, undefined, limits)).toMatchObject({ ok: false, reason: "unknown_sensor" });
    expect(decideReading({ sensorKey: "temperature", value: 1, occurredAt: now }, { ...sensor, isActive: false }, limits)).toMatchObject({ ok: false, reason: "sensor_disabled" });
    expect(decideReading({ sensorKey: "temperature", value: 120, occurredAt: now }, sensor, limits)).toMatchObject({ ok: false, reason: "out_of_accepted_range" });
    const bad = decideReading({ sensorKey: "temperature", value: 1, unit: "Pa", occurredAt: now }, sensor, limits);
    expect(bad.ok).toBe(false);
  });
  it("checks the range after unit conversion", () => {
    // 190 °F = 87.8 °C, above the sensor's 85 °C limit.
    expect(decideReading({ sensorKey: "temperature", value: 190, unit: "°F", occurredAt: now }, sensor, limits)).toMatchObject({ ok: false, reason: "out_of_accepted_range" });
  });
  it("rejects timestamps too old or too far in the future", () => {
    expect(decideReading({ sensorKey: "temperature", value: 20, occurredAt: new Date("2026-04-20T00:00:00Z") }, sensor, limits)).toMatchObject({ reason: "timestamp_too_old" });
    expect(decideReading({ sensorKey: "temperature", value: 20, occurredAt: new Date("2026-05-01T12:06:00Z") }, sensor, limits)).toMatchObject({ reason: "timestamp_in_future" });
    expect(decideReading({ sensorKey: "temperature", value: 20, occurredAt: new Date("2026-05-01T12:04:00Z") }, sensor, limits).ok).toBe(true);
  });
  it("flags late and out-of-order readings instead of rejecting them", () => {
    const d = decideReading({ sensorKey: "temperature", value: 20, occurredAt: new Date("2026-05-01T11:00:00Z") }, sensor, limits);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.outOfOrder).toBe(true);
      expect(d.quality).toMatchObject({ late: true, outOfOrder: true });
    }
  });
  it("records conversions in quality metadata", () => {
    const d = decideReading({ sensorKey: "temperature", value: 68, unit: "°F", occurredAt: now }, sensor, limits);
    expect(d.ok && d.quality).toMatchObject({ converted: true, originalUnit: "°F", originalValue: 68 });
  });
});
