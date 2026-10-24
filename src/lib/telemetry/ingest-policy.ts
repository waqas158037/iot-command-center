import { toCanonicalUnit } from "./measurements";

/**
 * Policy for each submitted reading (documented in docs/TELEMETRY.md):
 *  - malformed payloads are rejected as a whole (HTTP 400 / MQTT drop + log);
 *  - unknown or disabled sensors, unsupported units, out-of-range values,
 *    and timestamps too far in the past or future are rejected individually;
 *  - duplicates (same device + sensor + messageId) are ignored idempotently;
 *  - late and out-of-order readings are stored with quality flags and do not drive alerts.
 */
export interface SensorInfo {
  id: string;
  sensorKey: string;
  sensorType: string;
  unit: string;
  isActive: boolean;
  minValue: number | null;
  maxValue: number | null;
  latestOccurredAt: Date | null;
}

export interface ReadingInput {
  sensorKey: string;
  value: number;
  unit?: string;
  occurredAt: Date;
}

export type ReadingDecision =
  | { ok: true; sensor: SensorInfo; value: number; unit: string; occurredAt: Date; quality: Record<string, unknown> | null; outOfOrder: boolean }
  | { ok: false; sensorKey: string; reason: string };

export interface PolicyLimits {
  now: Date;
  maxLateSeconds: number;
  maxFutureSkewSeconds: number;
  lateFlagSeconds?: number;
}

export function decideReading(reading: ReadingInput, sensor: SensorInfo | undefined, limits: PolicyLimits): ReadingDecision {
  if (!sensor) return { ok: false, sensorKey: reading.sensorKey, reason: "unknown_sensor" };
  if (!sensor.isActive) return { ok: false, sensorKey: reading.sensorKey, reason: "sensor_disabled" };
  if (Number.isNaN(reading.occurredAt.getTime())) return { ok: false, sensorKey: reading.sensorKey, reason: "invalid_timestamp" };

  const ageMs = limits.now.getTime() - reading.occurredAt.getTime();
  if (ageMs > limits.maxLateSeconds * 1000) return { ok: false, sensorKey: reading.sensorKey, reason: "timestamp_too_old" };
  if (-ageMs > limits.maxFutureSkewSeconds * 1000) return { ok: false, sensorKey: reading.sensorKey, reason: "timestamp_in_future" };

  const conv = toCanonicalUnit(sensor.sensorType, reading.value, reading.unit);
  if (!conv.ok) return { ok: false, sensorKey: reading.sensorKey, reason: `unit_rejected: ${conv.reason}` };

  if ((sensor.minValue !== null && conv.value < sensor.minValue) || (sensor.maxValue !== null && conv.value > sensor.maxValue)) {
    return { ok: false, sensorKey: reading.sensorKey, reason: "out_of_accepted_range" };
  }

  const quality: Record<string, unknown> = {};
  if (conv.converted) Object.assign(quality, { converted: true, originalUnit: reading.unit, originalValue: reading.value });
  const late = ageMs > (limits.lateFlagSeconds ?? 300) * 1000;
  if (late) quality.late = true;
  const outOfOrder = sensor.latestOccurredAt !== null && reading.occurredAt < sensor.latestOccurredAt;
  if (outOfOrder) quality.outOfOrder = true;

  return { ok: true, sensor, value: conv.value, unit: conv.unit, occurredAt: reading.occurredAt, quality: Object.keys(quality).length ? quality : null, outOfOrder };
}
