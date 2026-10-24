import type { AlertConditionType, AlertSeverity } from "@prisma/client";

/**
 * Deterministic, side-effect-free alert evaluation used by the rule engine and unit tests.
 * Boundary policy: "above" and "below" are strict (a value equal to the threshold does not
 * violate); ranges are inclusive (a value equal to min or max is inside the range).
 */
export interface Threshold {
  value?: number;
  min?: number;
  max?: number;
  state?: number;
  missingSeconds?: number;
}

export const VALUE_CONDITIONS: AlertConditionType[] = ["THRESHOLD_ABOVE", "THRESHOLD_BELOW", "OUTSIDE_RANGE", "INSIDE_RANGE", "STATE_EQUALS", "BATTERY_LOW"];

export function isViolation(condition: AlertConditionType, threshold: Threshold, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  switch (condition) {
    case "THRESHOLD_ABOVE":
      return threshold.value !== undefined && value > threshold.value;
    case "THRESHOLD_BELOW":
    case "BATTERY_LOW":
      return threshold.value !== undefined && value < threshold.value;
    case "OUTSIDE_RANGE":
      return threshold.min !== undefined && threshold.max !== undefined && (value < threshold.min || value > threshold.max);
    case "INSIDE_RANGE":
      return threshold.min !== undefined && threshold.max !== undefined && value >= threshold.min && value <= threshold.max;
    case "STATE_EQUALS":
      return threshold.state !== undefined && Math.round(value) === Math.round(threshold.state);
    default:
      return false;
  }
}

/**
 * Consecutive-reading requirement: the newest `required` readings (newest first) must all violate.
 * Fewer readings than required never triggers.
 */
export function meetsConsecutive(condition: AlertConditionType, threshold: Threshold, newestFirst: number[], required: number): boolean {
  const n = Math.max(1, required);
  if (newestFirst.length < n) return false;
  return newestFirst.slice(0, n).every((v) => isViolation(condition, threshold, v));
}

export function withinCooldown(lastResolvedAt: Date | null | undefined, cooldownSeconds: number, now: Date): boolean {
  if (!lastResolvedAt || cooldownSeconds <= 0) return false;
  return now.getTime() - lastResolvedAt.getTime() < cooldownSeconds * 1000;
}

export function describeCondition(condition: AlertConditionType, t: Threshold, unit = ""): string {
  const u = unit && unit !== "state" && unit !== "count" ? ` ${unit}` : "";
  switch (condition) {
    case "THRESHOLD_ABOVE":
      return `above ${t.value}${u}`;
    case "THRESHOLD_BELOW":
      return `below ${t.value}${u}`;
    case "BATTERY_LOW":
      return `battery below ${t.value}%`;
    case "OUTSIDE_RANGE":
      return `outside ${t.min}–${t.max}${u}`;
    case "INSIDE_RANGE":
      return `within ${t.min}–${t.max}${u}`;
    case "STATE_EQUALS":
      return `state equals ${t.state}`;
    case "DEVICE_OFFLINE":
      return "device offline";
    case "MISSING_READINGS":
      return `no readings for ${t.missingSeconds}s`;
  }
}

export const SEVERITY_RANK: Record<AlertSeverity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function severityAtLeast(severity: AlertSeverity, min: AlertSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

export function openKeyFor(ruleId: string, deviceId: string | null, sensorId: string | null) {
  return `${ruleId}:${deviceId ?? "-"}:${sensorId ?? "-"}`;
}
