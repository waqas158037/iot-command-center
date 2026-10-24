import { Prisma, type AlertRule, type AlertSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { publishEvent } from "@/lib/realtime/events";
import { describeCondition, isViolation, meetsConsecutive, openKeyFor, VALUE_CONDITIONS, withinCooldown, type Threshold } from "@/lib/telemetry/alert-logic";
import { formatMeasurementValue, getMeasurement } from "@/lib/telemetry/measurements";
import { notifyProjectMembers } from "./notifications";

export interface EvaluatedSensor {
  id: string;
  sensorKey: string;
  sensorType: string;
  name: string;
  unit: string;
  value: number;
}

interface Target {
  projectId: string;
  deviceId: string | null;
  deviceName?: string;
  sensor?: EvaluatedSensor;
  isSimulated: boolean;
  value?: number;
}

/** Creates (or re-triggers) an alert for a rule target, honouring deduplication and cooldown. */
export async function raiseAlert(rule: AlertRule, target: Target, now = new Date()): Promise<"created" | "retriggered" | "cooldown"> {
  const openKey = openKeyFor(rule.id, target.deviceId, target.sensor?.id ?? null);
  const existing = await prisma.alert.findUnique({ where: { openKey }, select: { id: true } });
  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { occurrenceCount: { increment: 1 }, lastTriggeredAt: now, lastValue: target.value ?? null },
    });
    return "retriggered";
  }

  const lastResolved = await prisma.alert.findFirst({
    where: { alertRuleId: rule.id, deviceId: target.deviceId, sensorId: target.sensor?.id ?? null, status: "RESOLVED" },
    orderBy: { resolvedAt: "desc" },
    select: { resolvedAt: true },
  });
  if (withinCooldown(lastResolved?.resolvedAt, rule.cooldownSeconds, now)) return "cooldown";

  const threshold = rule.thresholdConfiguration as Threshold;
  const unit = target.sensor?.unit ?? "";
  const valueText = target.sensor && target.value !== undefined ? formatMeasurementValue(target.sensor.sensorType, target.value) : "";
  const where = [target.deviceName, target.sensor?.name].filter(Boolean).join(" · ");
  const title = `${rule.name}${where ? ` — ${where}` : ""}`;
  const description = target.sensor
    ? `${target.sensor.name} reported ${valueText}, ${describeCondition(rule.conditionType, threshold, unit)}${rule.consecutiveCount > 1 ? ` for ${rule.consecutiveCount} consecutive readings` : ""}.`
    : `${target.deviceName ?? "Device"}: ${describeCondition(rule.conditionType, threshold)}.`;

  try {
    const alert = await prisma.alert.create({
      data: {
        projectId: target.projectId,
        deviceId: target.deviceId,
        sensorId: target.sensor?.id ?? null,
        alertRuleId: rule.id,
        title: title.slice(0, 250),
        description,
        severity: rule.severity,
        status: "ACTIVE",
        triggeringValue: target.value ?? null,
        lastValue: target.value ?? null,
        thresholdSnapshot: { conditionType: rule.conditionType, threshold: rule.thresholdConfiguration, consecutiveCount: rule.consecutiveCount, cooldownSeconds: rule.cooldownSeconds, unit } as Prisma.InputJsonValue,
        openKey,
        isSimulated: target.isSimulated,
        lastTriggeredAt: now,
        events: { create: { eventType: "TRIGGERED", metadata: { value: target.value ?? null } } },
      },
    });
    await publishEvent({ type: "alert", projectId: alert.projectId, alertId: alert.id, severity: alert.severity, status: alert.status, title: alert.title, deviceId: alert.deviceId });
    const kind = rule.conditionType === "DEVICE_OFFLINE" ? "DEVICE_OFFLINE" : alert.severity === "CRITICAL" ? "ALERT_CRITICAL" : "ALERT_NEW";
    await notifyProjectMembers({
      projectId: alert.projectId,
      alertId: alert.id,
      kind,
      severity: alert.severity,
      title: `${alert.severity === "CRITICAL" ? "Critical: " : ""}${alert.title}`,
      message: `${description}${target.isSimulated ? " (simulated data)" : ""}`,
    });
    return "created";
  } catch (err) {
    // Another process opened the same alert concurrently; the unique openKey kept it single.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "retriggered";
    throw err;
  }
}

export async function autoResolve(rule: AlertRule, deviceId: string | null, sensorId: string | null, reason: string) {
  const openKey = openKeyFor(rule.id, deviceId, sensorId);
  const open = await prisma.alert.findUnique({ where: { openKey } });
  if (!open) return false;
  const now = new Date();
  await prisma.alert.update({
    where: { id: open.id },
    data: { status: "RESOLVED", resolvedAt: now, openKey: null, events: { create: { eventType: "AUTO_RESOLVED", notes: reason } } },
  });
  await publishEvent({ type: "alert", projectId: open.projectId, alertId: open.id, severity: open.severity, status: "RESOLVED", title: open.title, deviceId: open.deviceId });
  return true;
}

function ruleAppliesToSensor(rule: AlertRule, deviceId: string, sensor: { id: string; sensorType: string }) {
  if (rule.deviceId && rule.deviceId !== deviceId) return false;
  if (rule.sensorId) return rule.sensorId === sensor.id;
  if (rule.conditionType === "BATTERY_LOW") return sensor.sensorType === (rule.sensorType ?? "battery");
  return rule.sensorType === sensor.sensorType;
}

/**
 * Evaluates value-based rules for the newest accepted reading of each sensor in a message.
 * Consecutive requirements look at the newest N stored readings (by occurredAt).
 */
export async function evaluateTelemetryAlerts(params: { projectId: string; deviceId: string; deviceName: string; sensors: EvaluatedSensor[]; isSimulated: boolean }) {
  if (params.sensors.length === 0) return { evaluated: 0, created: 0 };
  const rules = await prisma.alertRule.findMany({
    where: {
      projectId: params.projectId,
      isEnabled: true,
      OR: [{ deviceId: null }, { deviceId: params.deviceId }],
      conditionType: { in: [...VALUE_CONDITIONS, "MISSING_READINGS"] },
    },
  });
  let evaluated = 0;
  let created = 0;
  for (const sensor of params.sensors) {
    for (const rule of rules.filter((r) => ruleAppliesToSensor(r, params.deviceId, sensor))) {
      evaluated++;
      if (rule.conditionType === "MISSING_READINGS") {
        // Data arrived, so a "missing readings" alert for this sensor can close.
        if (rule.autoResolve) await autoResolve(rule, params.deviceId, sensor.id, "Readings resumed");
        continue;
      }
      const threshold = rule.thresholdConfiguration as Threshold;
      let violating = isViolation(rule.conditionType, threshold, sensor.value);
      if (violating && rule.consecutiveCount > 1) {
        const recent = await prisma.telemetryReading.findMany({
          where: { sensorId: sensor.id },
          orderBy: { occurredAt: "desc" },
          take: rule.consecutiveCount,
          select: { value: true },
        });
        violating = meetsConsecutive(rule.conditionType, threshold, recent.map((r) => r.value.toNumber()), rule.consecutiveCount);
      }
      try {
        if (violating) {
          const res = await raiseAlert(rule, { projectId: params.projectId, deviceId: params.deviceId, deviceName: params.deviceName, sensor, isSimulated: params.isSimulated, value: sensor.value });
          if (res === "created") created++;
        } else if (rule.autoResolve) {
          await autoResolve(rule, params.deviceId, sensor.id, `Value returned to normal (${sensor.value})`);
        }
      } catch (err) {
        logger.error({ err, ruleId: rule.id, sensorId: sensor.id }, "alert evaluation failed");
      }
    }
  }
  return { evaluated, created };
}

/** Device-health rules: offline alerts when a device times out, auto-resolve when it returns. */
export async function evaluateDeviceOffline(device: { id: string; name: string; projectId: string; protocol: string }, offline: boolean) {
  const rules = await prisma.alertRule.findMany({
    where: { projectId: device.projectId, isEnabled: true, conditionType: "DEVICE_OFFLINE", OR: [{ deviceId: null }, { deviceId: device.id }] },
  });
  for (const rule of rules) {
    if (offline) await raiseAlert(rule, { projectId: device.projectId, deviceId: device.id, deviceName: device.name, isSimulated: device.protocol === "SIMULATED" });
    else if (rule.autoResolve) await autoResolve(rule, device.id, null, "Device back online");
  }
}

/** Periodic check for sensors that stopped reporting (MISSING_READINGS rules). */
export async function evaluateMissingReadings(now = new Date()) {
  const rules = await prisma.alertRule.findMany({ where: { isEnabled: true, conditionType: "MISSING_READINGS", project: { archivedAt: null } } });
  let raised = 0;
  for (const rule of rules) {
    const windowSec = (rule.thresholdConfiguration as Threshold).missingSeconds ?? 600;
    const sensors = await prisma.sensor.findMany({
      where: {
        isActive: true,
        device: { projectId: rule.projectId, status: { not: "DISABLED" }, ...(rule.deviceId ? { id: rule.deviceId } : {}) },
        ...(rule.sensorId ? { id: rule.sensorId } : rule.sensorType ? { sensorType: rule.sensorType } : {}),
      },
      select: { id: true, sensorKey: true, sensorType: true, name: true, unit: true, deviceId: true, device: { select: { name: true, protocol: true, lastSeenAt: true } } },
      take: 500,
    });
    for (const s of sensors) {
      const latest = await prisma.telemetryReading.findFirst({ where: { sensorId: s.id }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } });
      // Sensors that never reported are not "missing" yet; device-offline rules cover silent devices.
      if (!latest) continue;
      if (now.getTime() - latest.occurredAt.getTime() > windowSec * 1000) {
        const res = await raiseAlert(rule, {
          projectId: rule.projectId,
          deviceId: s.deviceId,
          deviceName: s.device.name,
          sensor: { id: s.id, sensorKey: s.sensorKey, sensorType: s.sensorType, name: s.name, unit: s.unit, value: NaN },
          isSimulated: s.device.protocol === "SIMULATED",
        }, now);
        if (res === "created") raised++;
      }
    }
  }
  return raised;
}

export function severityLabel(s: AlertSeverity) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function unitLabel(sensorType: string) {
  return getMeasurement(sensorType)?.canonicalUnit ?? "";
}
