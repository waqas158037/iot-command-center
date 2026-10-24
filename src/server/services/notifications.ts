import type { AlertSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/http/errors";
import { smtpConfigured } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logging/logger";
import { severityAtLeast } from "@/lib/telemetry/alert-logic";
import { notificationPreferencesSchema, type NotificationPreferences } from "@/lib/validation/schemas";
import type { Actor } from "@/lib/permissions/policies";

export type NotificationKind = "ALERT_NEW" | "ALERT_CRITICAL" | "DEVICE_OFFLINE" | "ALERT_ACKNOWLEDGED" | "ALERT_RESOLVED";

export function parsePreferences(raw: unknown): NotificationPreferences {
  const parsed = notificationPreferencesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : notificationPreferencesSchema.parse({});
}

/** Whether a user's preferences accept a notification of this kind and severity. */
export function wantsNotification(prefs: NotificationPreferences, kind: NotificationKind, severity: AlertSeverity): boolean {
  if (kind === "DEVICE_OFFLINE") return prefs.deviceOffline;
  if (kind === "ALERT_ACKNOWLEDGED" || kind === "ALERT_RESOLVED") return prefs.alertUpdates;
  if (kind === "ALERT_CRITICAL") return true; // critical alerts always reach project members
  return severityAtLeast(severity, prefs.minSeverity);
}

/**
 * Fans an alert event out to the project's active members. Only members of the alert's project
 * are recipients, so notifications can never leak another project's data.
 */
export async function notifyProjectMembers(params: {
  projectId: string;
  alertId: string;
  kind: NotificationKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  excludeUserId?: string;
}) {
  const members = await prisma.projectMember.findMany({
    where: { projectId: params.projectId, user: { isActive: true } },
    select: { user: { select: { id: true, email: true, notificationPreferences: true } } },
  });
  const recipients = members
    .map((m) => m.user)
    .filter((u) => u.id !== params.excludeUserId)
    .filter((u) => wantsNotification(parsePreferences(u.notificationPreferences), params.kind, params.severity));
  if (recipients.length === 0) return 0;

  const dedupeKey = `${params.kind}:${params.alertId}`;
  const created = await prisma.notification.createManyAndReturn({
    data: recipients.map((u) => ({ userId: u.id, projectId: params.projectId, alertId: params.alertId, kind: params.kind, title: params.title, message: params.message, dedupeKey })),
    skipDuplicates: true,
    select: { id: true, userId: true },
  });

  if (smtpConfigured()) {
    const emailUsers = new Set(recipients.filter((u) => parsePreferences(u.notificationPreferences).email).map((u) => u.id));
    const deliveries = created.filter((n) => emailUsers.has(n.userId)).map((n) => ({ notificationId: n.id, channel: "EMAIL" }));
    if (deliveries.length) await prisma.notificationDelivery.createMany({ data: deliveries });
  }
  return created.length;
}

export async function listNotifications(actor: Actor, opts: { page?: number; pageSize?: number; unreadOnly?: boolean }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const where = { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, kind: true, title: true, message: true, alertId: true, projectId: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { items, total, unreadCount, page, pageSize };
}

export async function setNotificationRead(actor: Actor, id: string, read: boolean) {
  // Scoped by userId: another user's notification is indistinguishable from a missing one.
  const res = await prisma.notification.updateMany({ where: { id, userId: actor.id }, data: { readAt: read ? new Date() : null } });
  if (res.count === 0) throw notFound("Notification");
}

export async function markAllRead(actor: Actor) {
  const res = await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: res.count };
}

const MAX_ATTEMPTS = 5;

/** Worker job: delivers pending emails with exponential backoff. */
export async function processEmailDeliveries(batch = 20) {
  const due = await prisma.notificationDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    take: batch,
    orderBy: { nextAttemptAt: "asc" },
    include: { notification: { select: { title: true, message: true, user: { select: { email: true, isActive: true } } } } },
  });
  for (const d of due) {
    if (!d.notification.user.isActive || !smtpConfigured()) {
      await prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: "SKIPPED" } });
      continue;
    }
    try {
      await sendMail(d.notification.user.email, `[IoT Command Center] ${d.notification.title}`, d.notification.message);
      await prisma.notificationDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
    } catch (err) {
      const attempts = d.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      logger.warn({ err, deliveryId: d.id, attempts }, "email delivery failed");
      await prisma.notificationDelivery.update({
        where: { id: d.id },
        data: { attempts, lastError: String((err as Error).message).slice(0, 300), status: failed ? "FAILED" : "PENDING", nextAttemptAt: new Date(Date.now() + 2 ** attempts * 30_000) },
      });
    }
  }
  return due.length;
}
