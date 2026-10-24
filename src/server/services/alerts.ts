import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http/errors";
import { paginated } from "@/lib/http/pagination";
import { canOnProject, type Actor } from "@/lib/permissions/policies";
import { publishEvent } from "@/lib/realtime/events";
import {
  alertActionSchema,
  createAlertRuleSchema,
  listAlertsSchema,
  updateAlertRuleSchema,
  validateThreshold,
  type CreateAlertRuleInput,
} from "@/lib/validation/schemas";
import type { z } from "zod";
import { accessibleProjectIds, assertAlertAction, assertProjectAction, assertRuleAction } from "./access";
import { recordAudit } from "./audit";
import { notifyProjectMembers } from "./notifications";

interface AuditCtx {
  requestId?: string;
  ip?: string;
}

const alertListSelect = {
  id: true,
  title: true,
  severity: true,
  status: true,
  triggeringValue: true,
  lastValue: true,
  occurrenceCount: true,
  isSimulated: true,
  createdAt: true,
  lastTriggeredAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  project: { select: { id: true, name: true, projectCode: true } },
  device: { select: { id: true, name: true } },
  sensor: { select: { id: true, name: true, unit: true, sensorType: true } },
} satisfies Prisma.AlertSelect;

export async function listAlerts(actor: Actor, query: z.input<typeof listAlertsSchema>) {
  const q = listAlertsSchema.parse(query);
  const ids = await accessibleProjectIds(actor);
  if (q.projectId && ids && !ids.includes(q.projectId)) throw notFound("Project");
  const where: Prisma.AlertWhereInput = {
    ...(q.projectId ? { projectId: q.projectId } : ids ? { projectId: { in: ids } } : {}),
    ...(q.deviceId ? { deviceId: q.deviceId } : {}),
    ...(q.severity ? { severity: q.severity } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.alert.findMany({ where, select: alertListSelect, orderBy: [{ createdAt: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.alert.count({ where }),
  ]);
  return paginated(items, total, q);
}

export async function getAlert(actor: Actor, alertId: string) {
  const { access } = await assertAlertAction(actor, alertId, "alert.view");
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: {
      ...alertListSelect,
      description: true,
      thresholdSnapshot: true,
      rule: { select: { id: true, name: true, conditionType: true, isEnabled: true } },
      acknowledgedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, eventType: true, notes: true, metadata: true, createdAt: true, actor: { select: { name: true } } } },
    },
  });
  if (!alert) throw notFound("Alert");
  return {
    ...alert,
    access: {
      canAcknowledge: canOnProject(actor, "alert.acknowledge", access),
      canResolve: canOnProject(actor, "alert.resolve", access),
      canNote: canOnProject(actor, "alert.note", access),
    },
  };
}

export async function actOnAlert(actor: Actor, alertId: string, input: z.input<typeof alertActionSchema>, ctx: AuditCtx = {}) {
  const data = alertActionSchema.parse(input);
  const permission = data.action === "acknowledge" ? "alert.acknowledge" : data.action === "resolve" ? "alert.resolve" : "alert.note";
  await assertAlertAction(actor, alertId, permission);
  const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
  const now = new Date();

  if (data.action === "note") {
    if (!data.notes) throw badRequest("A note is required", { field: "notes" });
    await prisma.alertEvent.create({ data: { alertId, eventType: "NOTE", actorId: actor.id, notes: data.notes } });
    await recordAudit({ actorId: actor.id, action: "alert.note", resourceType: "alert", resourceId: alertId, requestId: ctx.requestId, ipAddress: ctx.ip });
    return getAlert(actor, alertId);
  }
  if (alert.status === "RESOLVED") throw conflict("This alert is already resolved");
  if (data.action === "acknowledge" && alert.status === "ACKNOWLEDGED") throw conflict("This alert is already acknowledged");

  // Conditional update guards against two users acting on the same alert at once.
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.alert.updateMany({
      where: { id: alertId, status: alert.status },
      data:
        data.action === "acknowledge"
          ? { status: "ACKNOWLEDGED", acknowledgedAt: now, acknowledgedById: actor.id }
          : { status: "RESOLVED", resolvedAt: now, resolvedById: actor.id, openKey: null, ...(alert.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedById: actor.id }) },
    });
    if (res.count === 0) throw conflict("The alert was changed by someone else; refresh and try again");
    await tx.alertEvent.create({ data: { alertId, eventType: data.action === "acknowledge" ? "ACKNOWLEDGED" : "RESOLVED", actorId: actor.id, notes: data.notes } });
    await recordAudit({ actorId: actor.id, action: `alert.${data.action}`, resourceType: "alert", resourceId: alertId, metadata: { projectId: alert.projectId, severity: alert.severity }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return tx.alert.findUniqueOrThrow({ where: { id: alertId } });
  });

  await publishEvent({ type: "alert", projectId: updated.projectId, alertId, severity: updated.severity, status: updated.status, title: updated.title, deviceId: updated.deviceId });
  await notifyProjectMembers({
    projectId: updated.projectId,
    alertId,
    kind: data.action === "acknowledge" ? "ALERT_ACKNOWLEDGED" : "ALERT_RESOLVED",
    severity: updated.severity,
    title: `${data.action === "acknowledge" ? "Acknowledged" : "Resolved"}: ${updated.title}`,
    message: data.notes ? `Note: ${data.notes}` : `The alert was ${data.action === "acknowledge" ? "acknowledged" : "resolved"}.`,
    excludeUserId: actor.id,
  });
  return getAlert(actor, alertId);
}

// ── Rules ──────────────────────────────────────────────

export async function listAlertRules(actor: Actor, query: { projectId?: string; page?: number; pageSize?: number }) {
  const ids = await accessibleProjectIds(actor);
  if (query.projectId && ids && !ids.includes(query.projectId)) throw notFound("Project");
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const where: Prisma.AlertRuleWhereInput = query.projectId ? { projectId: query.projectId } : ids ? { projectId: { in: ids } } : {};
  const [items, total] = await Promise.all([
    prisma.alertRule.findMany({
      where,
      orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { project: { select: { id: true, name: true, projectCode: true } }, device: { select: { id: true, name: true } }, sensor: { select: { id: true, name: true } }, _count: { select: { alerts: true } } },
    }),
    prisma.alertRule.count({ where }),
  ]);
  return paginated(items, total, { page, pageSize });
}

export async function getAlertRule(actor: Actor, ruleId: string) {
  await assertRuleAction(actor, ruleId, "alert.view");
  return prisma.alertRule.findUniqueOrThrow({ where: { id: ruleId }, include: { project: { select: { id: true, name: true } }, device: { select: { id: true, name: true } }, sensor: { select: { id: true, name: true } } } });
}

async function assertRuleTargets(projectId: string, deviceId?: string | null, sensorId?: string | null) {
  if (deviceId) {
    const d = await prisma.device.findUnique({ where: { id: deviceId }, select: { projectId: true } });
    if (!d || d.projectId !== projectId) throw badRequest("Device does not belong to this project", { field: "deviceId" });
  }
  if (sensorId) {
    const s = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { deviceId: true, device: { select: { projectId: true } } } });
    if (!s || s.device.projectId !== projectId) throw badRequest("Sensor does not belong to this project", { field: "sensorId" });
    if (deviceId && s.deviceId !== deviceId) throw badRequest("Sensor does not belong to the selected device", { field: "sensorId" });
  }
}

export async function createAlertRule(actor: Actor, input: CreateAlertRuleInput, ctx: AuditCtx = {}) {
  const data = createAlertRuleSchema.parse(input);
  await assertProjectAction(actor, data.projectId, "alertRule.manage");
  await assertRuleTargets(data.projectId, data.deviceId, data.sensorId);
  return prisma.$transaction(async (tx) => {
    const rule = await tx.alertRule.create({
      data: {
        projectId: data.projectId,
        deviceId: data.deviceId ?? null,
        sensorId: data.sensorId ?? null,
        sensorType: data.sensorType ?? null,
        name: data.name,
        description: data.description,
        conditionType: data.conditionType,
        thresholdConfiguration: data.thresholdConfiguration,
        severity: data.severity,
        consecutiveCount: data.consecutiveCount,
        cooldownSeconds: data.cooldownSeconds,
        autoResolve: data.autoResolve,
        isEnabled: data.isEnabled,
        createdById: actor.id,
      },
    });
    await recordAudit({ actorId: actor.id, action: "alertRule.create", resourceType: "alertRule", resourceId: rule.id, metadata: { projectId: data.projectId, conditionType: data.conditionType, threshold: data.thresholdConfiguration, severity: data.severity }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return rule;
  });
}

export async function updateAlertRule(actor: Actor, ruleId: string, input: z.input<typeof updateAlertRuleSchema>, ctx: AuditCtx = {}) {
  const data = updateAlertRuleSchema.parse(input);
  const { rule } = await assertRuleAction(actor, ruleId, "alertRule.manage");
  const current = await prisma.alertRule.findUniqueOrThrow({ where: { id: ruleId } });
  const conditionType = data.conditionType ?? current.conditionType;
  const threshold = data.thresholdConfiguration ?? (current.thresholdConfiguration as Record<string, number>);
  const err = validateThreshold(conditionType, threshold);
  if (err) throw badRequest(err, { field: "thresholdConfiguration" });
  await assertRuleTargets(rule.projectId, data.deviceId !== undefined ? data.deviceId : current.deviceId, data.sensorId !== undefined ? data.sensorId : current.sensorId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.alertRule.update({ where: { id: ruleId }, data: { ...data, thresholdConfiguration: threshold } });
    await recordAudit(
      { actorId: actor.id, action: "alertRule.update", resourceType: "alertRule", resourceId: ruleId, metadata: { changes: data, previousThreshold: current.thresholdConfiguration }, requestId: ctx.requestId, ipAddress: ctx.ip },
      tx,
    );
    return updated;
  });
}

export async function deleteAlertRule(actor: Actor, ruleId: string, ctx: AuditCtx = {}) {
  await assertRuleAction(actor, ruleId, "alertRule.manage");
  const alertCount = await prisma.alert.count({ where: { alertRuleId: ruleId } });
  await prisma.$transaction(async (tx) => {
    if (alertCount > 0) {
      // Keep alert history: disable instead of deleting rules that produced alerts.
      await tx.alertRule.update({ where: { id: ruleId }, data: { isEnabled: false } });
    } else {
      await tx.alertRule.delete({ where: { id: ruleId } });
    }
    await recordAudit({ actorId: actor.id, action: alertCount ? "alertRule.disable" : "alertRule.delete", resourceType: "alertRule", resourceId: ruleId, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
  });
  return { deleted: alertCount === 0, disabled: alertCount > 0 };
}
