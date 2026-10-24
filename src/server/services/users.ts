import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";
import { paginated } from "@/lib/http/pagination";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/auth/password";
import { sendMail } from "@/lib/mail";
import { canChangeUserRole, canGlobal, maxProjectRoleForUser, type Actor } from "@/lib/permissions/policies";
import { inviteUserSchema, notificationPreferencesSchema, profileSchema, updateUserSchema } from "@/lib/validation/schemas";
import type { z } from "zod";
import { assertGlobal } from "./access";
import { recordAudit } from "./audit";
import { parsePreferences } from "./notifications";

interface AuditCtx {
  requestId?: string;
  ip?: string;
}

export async function listUsers(actor: Actor, query: { search?: string; role?: string; status?: string; page?: number; pageSize?: number }) {
  assertGlobal(actor, "users.view");
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const where: Prisma.UserWhereInput = {
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { email: { contains: query.search, mode: "insensitive" } }] } : {}),
    ...(query.role && ["SUPER_ADMIN", "PROJECT_MANAGER", "ENGINEER", "VIEWER"].includes(query.role) ? { role: query.role as never } : {}),
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    // Project managers only need active users to add as members.
    ...(canGlobal(actor, "users.manage") ? {} : { isActive: true }),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, role: true, isActive: true, timezone: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return paginated(items, total, { page, pageSize });
}

export async function updateUser(actor: Actor, userId: string, input: z.input<typeof updateUserSchema>, ctx: AuditCtx = {}) {
  const data = updateUserSchema.parse(input);
  assertGlobal(actor, "users.manage");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User");
  if (userId === actor.id && (data.isActive === false || data.role)) throw forbidden("You cannot change your own role or deactivate yourself");
  if (data.role && !canChangeUserRole(actor, userId, data.role)) throw forbidden();
  if ((data.role && data.role !== "SUPER_ADMIN" && target.role === "SUPER_ADMIN") || (data.isActive === false && target.role === "SUPER_ADMIN")) {
    const admins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (admins <= 1) throw conflict("At least one active super admin is required");
  }

  return prisma.$transaction(async (tx) => {
    const securityChange = (data.role && data.role !== target.role) || (data.isActive !== undefined && data.isActive !== target.isActive);
    const user = await tx.user.update({
      where: { id: userId },
      data: { ...data, ...(securityChange ? { sessionVersion: { increment: 1 } } : {}) },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (data.role && data.role !== target.role) {
      // Downgrade project roles that exceed the new platform role cap.
      const cap = maxProjectRoleForUser(data.role);
      if (cap === "VIEWER") await tx.projectMember.updateMany({ where: { userId, projectRole: { in: ["MANAGER", "ENGINEER"] } }, data: { projectRole: "VIEWER" } });
      if (cap === "ENGINEER") await tx.projectMember.updateMany({ where: { userId, projectRole: "MANAGER" }, data: { projectRole: "ENGINEER" } });
    }
    await recordAudit(
      {
        actorId: actor.id,
        action: data.role && data.role !== target.role ? "user.role.change" : data.isActive === false ? "user.deactivate" : data.isActive === true ? "user.activate" : "user.update",
        resourceType: "user",
        resourceId: userId,
        metadata: { from: { role: target.role, isActive: target.isActive }, to: data },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      },
      tx,
    );
    return user;
  });
}

export async function inviteUser(actor: Actor, input: z.input<typeof inviteUserSchema>, ctx: AuditCtx = {}) {
  const data = inviteUserSchema.parse(input);
  assertGlobal(actor, "users.manage");
  const email = normalizeEmail(data.email);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw conflict("A user with this email already exists");
  const token = randomToken(32);
  const invitation = await prisma.userInvitation.create({
    data: { email, role: data.role, tokenHash: sha256Hex(token), invitedById: actor.id, expiresAt: new Date(Date.now() + 7 * 86400_000) },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  const link = `${env().APP_URL}/register?invite=${encodeURIComponent(token)}`;
  const emailed = await sendMail(email, "You're invited to IoT Command Center", `You have been invited as ${data.role}. Accept within 7 days:\n\n${link}`).catch(() => false);
  await recordAudit({ actorId: actor.id, action: "user.invite", resourceType: "invitation", resourceId: invitation.id, metadata: { email, role: data.role, emailed }, requestId: ctx.requestId, ipAddress: ctx.ip });
  // The link is returned once so an admin can share it when email is not configured.
  return { invitation, emailed, inviteLink: link };
}

export async function updateProfile(actor: Actor, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  const user = await prisma.user.update({ where: { id: actor.id }, data, select: { id: true, name: true, timezone: true } });
  await recordAudit({ actorId: actor.id, action: "user.profile.update", resourceType: "user", resourceId: actor.id, metadata: data });
  return user;
}

export async function getNotificationPreferences(actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { notificationPreferences: true } });
  return parsePreferences(user.notificationPreferences);
}

export async function updateNotificationPreferences(actor: Actor, input: unknown) {
  const prefs = notificationPreferencesSchema.parse(input);
  await prisma.user.update({ where: { id: actor.id }, data: { notificationPreferences: prefs } });
  await recordAudit({ actorId: actor.id, action: "user.notification_preferences.update", resourceType: "user", resourceId: actor.id, metadata: prefs });
  return prefs;
}

export async function listAuditLogs(actor: Actor, query: { search?: string; action?: string; outcome?: string; resourceType?: string; actorId?: string; from?: Date; to?: Date; page?: number; pageSize?: number }) {
  assertGlobal(actor, "audit.view");
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  if (query.outcome && !["SUCCESS", "FAILURE", "DENIED"].includes(query.outcome)) throw badRequest("Invalid outcome");
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.outcome ? { outcome: query.outcome as never } : {}),
    ...(query.resourceType ? { resourceType: query.resourceType } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.search ? { OR: [{ action: { contains: query.search, mode: "insensitive" } }, { resourceId: { contains: query.search } }, { actor: { name: { contains: query.search, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { id: true, name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return paginated(items, total, { page, pageSize });
}
