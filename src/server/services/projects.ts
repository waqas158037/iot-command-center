import type { Prisma, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";
import { paginated } from "@/lib/http/pagination";
import { canOnProject, maxProjectRoleForUser, type Actor } from "@/lib/permissions/policies";
import { getProjectTypeTemplate } from "@/lib/project-types/registry";
import { settingsSchemaFor } from "@/lib/project-types/config";
import type { ProjectConfiguration } from "@/lib/project-types/types";
import {
  createProjectSchema,
  listProjectsSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@/lib/validation/schemas";
import type { z } from "zod";
import { accessibleProjectIds, assertGlobal, assertProjectAction, getProjectAccess } from "./access";
import { recordAudit } from "./audit";

interface AuditCtx {
  requestId?: string;
  ip?: string;
}

const projectSummarySelect = {
  id: true,
  name: true,
  projectCode: true,
  description: true,
  status: true,
  startedAt: true,
  endedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
  projectType: { select: { key: true, name: true, category: true, isSensitive: true } },
  _count: { select: { devices: true, members: true } },
} satisfies Prisma.ProjectSelect;

export async function listProjects(actor: Actor, query: z.input<typeof listProjectsSchema>) {
  const q = listProjectsSchema.parse(query);
  const ids = await accessibleProjectIds(actor);
  const where: Prisma.ProjectWhereInput = {
    ...(ids ? { id: { in: ids } } : {}),
    ...(q.status ? { status: q.status } : q.includeArchived ? {} : { archivedAt: null }),
    ...(q.category || q.type ? { projectType: { ...(q.category ? { category: q.category } : {}), ...(q.type ? { key: q.type } : {}) } } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { projectCode: { contains: q.search, mode: "insensitive" } }, { description: { contains: q.search, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({ where, select: projectSummarySelect, orderBy: { [q.sort]: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.project.count({ where }),
  ]);

  // Per-project online device and open alert counts in two grouped queries (no N+1).
  const projectIds = rows.map((r) => r.id);
  const [online, openAlerts] = await Promise.all([
    prisma.device.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, status: "ONLINE" }, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds }, status: { not: "RESOLVED" } }, _count: { _all: true } }),
  ]);
  const onlineMap = new Map(online.map((o) => [o.projectId, o._count._all]));
  const alertMap = new Map(openAlerts.map((o) => [o.projectId, o._count._all]));

  return paginated(
    rows.map((r) => ({ ...r, onlineDevices: onlineMap.get(r.id) ?? 0, openAlerts: alertMap.get(r.id) ?? 0 })),
    total,
    q,
  );
}

export async function getProject(actor: Actor, projectId: string) {
  const access = await getProjectAccess(actor, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ...projectSummarySelect, configuration: true, projectType: { select: { id: true, key: true, name: true, category: true, isSensitive: true, description: true } } },
  });
  if (!project) throw notFound("Project");
  const template = getProjectTypeTemplate(project.projectType.key);
  return {
    ...project,
    configuration: project.configuration as unknown as ProjectConfiguration,
    template: template
      ? { analyticsLabel: template.analyticsLabel, analyticsNote: template.analyticsNote, safetyNotice: template.safetyNotice, configSchema: template.configSchema, deviceRequirements: template.deviceRequirements }
      : null,
    access: {
      role: access.membershipRole,
      canUpdate: canOnProject(actor, "project.update", access),
      canManageMembers: canOnProject(actor, "project.members.manage", access),
      canCreateDevice: canOnProject(actor, "device.create", access),
      canManageRules: canOnProject(actor, "alertRule.manage", access),
      canAcknowledge: canOnProject(actor, "alert.acknowledge", access),
      canExport: canOnProject(actor, "report.export", access),
      canSimulate: canOnProject(actor, "simulation.control", access),
    },
  };
}

export async function createProject(actor: Actor, input: CreateProjectInput, ctx: AuditCtx = {}) {
  assertGlobal(actor, "project.create");
  const data = createProjectSchema.parse(input);
  const type = await prisma.projectType.findUnique({ where: { key: data.projectTypeKey } });
  if (!type || !type.isActive) throw badRequest("Unknown or inactive project type", { field: "projectTypeKey" });

  const existing = await prisma.project.findUnique({ where: { projectCode: data.projectCode }, select: { id: true } });
  if (existing) throw conflict("Project code is already in use", { field: "projectCode" });

  // Each project receives its own copy of the template so later edits stay local to it.
  const configuration = structuredClone(type.defaultConfiguration) as unknown as ProjectConfiguration;

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: data.name,
        projectCode: data.projectCode,
        description: data.description,
        projectTypeId: type.id,
        status: data.status,
        ownerId: actor.id,
        startedAt: data.startedAt ?? (data.status === "ACTIVE" ? new Date() : null),
        endedAt: data.endedAt ?? null,
        configuration: configuration as unknown as Prisma.InputJsonValue,
        members: { create: { userId: actor.id, projectRole: "MANAGER" } },
      },
    });
    if (data.applyTemplateRules) {
      for (const rule of configuration.alertRules) {
        await tx.alertRule.create({
          data: {
            projectId: created.id,
            name: rule.name,
            description: rule.description ?? "Created from the project-type template",
            conditionType: rule.conditionType,
            sensorType: rule.sensorType ?? null,
            thresholdConfiguration: rule.threshold,
            severity: rule.severity,
            consecutiveCount: rule.consecutiveCount ?? 1,
            cooldownSeconds: rule.cooldownSeconds ?? 300,
            autoResolve: rule.autoResolve ?? false,
            createdById: actor.id,
          },
        });
      }
    }
    await recordAudit({ actorId: actor.id, action: "project.create", resourceType: "project", resourceId: created.id, metadata: { projectCode: created.projectCode, type: type.key }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return created;
  });
  return project;
}

export async function updateProject(actor: Actor, projectId: string, input: UpdateProjectInput, ctx: AuditCtx = {}) {
  const data = updateProjectSchema.parse(input);
  await assertProjectAction(actor, projectId, "project.update");
  const current = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { projectType: true } });

  const update: Prisma.ProjectUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.startedAt !== undefined) update.startedAt = data.startedAt;
  if (data.endedAt !== undefined) update.endedAt = data.endedAt;
  const start = data.startedAt !== undefined ? data.startedAt : current.startedAt;
  const end = data.endedAt !== undefined ? data.endedAt : current.endedAt;
  if (start && end && end < start) throw badRequest("End date must be after the start date", { field: "endedAt" });

  if (data.status !== undefined && data.status !== current.status) {
    update.status = data.status;
    if (data.status === "ARCHIVED") update.archivedAt = new Date();
    else if (current.status === "ARCHIVED") update.archivedAt = null;
    if (data.status === "ACTIVE" && !current.startedAt && data.startedAt === undefined) update.startedAt = new Date();
    if (data.status === "COMPLETED" && !current.endedAt && data.endedAt === undefined) update.endedAt = new Date();
  }

  if (data.settings) {
    const template = getProjectTypeTemplate(current.projectType.key);
    const schema = settingsSchemaFor(template?.configSchema ?? []);
    const config = current.configuration as unknown as ProjectConfiguration;
    const settings = schema.parse({ ...config.settings, ...data.settings });
    update.configuration = { ...config, settings } as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: update });
    await recordAudit(
      {
        actorId: actor.id,
        action: data.status === "ARCHIVED" ? "project.archive" : "project.update",
        resourceType: "project",
        resourceId: projectId,
        metadata: { fields: Object.keys(data), status: data.status },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      },
      tx,
    );
    return p;
  });
  return updated;
}

export async function archiveProject(actor: Actor, projectId: string, ctx: AuditCtx = {}) {
  await assertProjectAction(actor, projectId, "project.archive");
  return updateProject(actor, projectId, { status: "ARCHIVED" }, ctx);
}

// ── Members ──────────────────────────────────────────────

export async function listMembers(actor: Actor, projectId: string) {
  await getProjectAccess(actor, projectId);
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, projectRole: true, createdAt: true, user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
  });
  return members;
}

async function assertAssignable(userId: string, projectRole: ProjectRole) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } });
  if (!user || !user.isActive) throw badRequest("User not found or inactive", { field: "userId" });
  const cap = maxProjectRoleForUser(user.role);
  const rank = { VIEWER: 1, ENGINEER: 2, MANAGER: 3 } as const;
  if (rank[projectRole] > rank[cap]) {
    throw badRequest(`This user's platform role allows at most the ${cap.toLowerCase()} project role`, { field: "projectRole" });
  }
  return user;
}

export async function addMember(actor: Actor, projectId: string, userId: string, projectRole: ProjectRole, ctx: AuditCtx = {}) {
  await assertProjectAction(actor, projectId, "project.members.manage");
  await assertAssignable(userId, projectRole);
  const exists = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (exists) throw conflict("User is already a member of this project");
  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.create({ data: { projectId, userId, projectRole } });
    await recordAudit({ actorId: actor.id, action: "project.member.add", resourceType: "project", resourceId: projectId, metadata: { userId, projectRole }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return m;
  });
  return member;
}

async function managerCount(projectId: string) {
  return prisma.projectMember.count({ where: { projectId, projectRole: "MANAGER" } });
}

export async function updateMember(actor: Actor, projectId: string, userId: string, projectRole: ProjectRole, ctx: AuditCtx = {}) {
  await assertProjectAction(actor, projectId, "project.members.manage");
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!member) throw notFound("Project member");
  await assertAssignable(userId, projectRole);
  if (member.projectRole === "MANAGER" && projectRole !== "MANAGER" && (await managerCount(projectId)) <= 1) {
    throw conflict("A project must keep at least one manager");
  }
  return prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.update({ where: { id: member.id }, data: { projectRole } });
    await recordAudit({ actorId: actor.id, action: "project.member.update", resourceType: "project", resourceId: projectId, metadata: { userId, from: member.projectRole, to: projectRole }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
    return m;
  });
}

export async function removeMember(actor: Actor, projectId: string, userId: string, ctx: AuditCtx = {}) {
  await assertProjectAction(actor, projectId, "project.members.manage");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerId: true } });
  if (project.ownerId === userId) throw forbidden("The project owner cannot be removed");
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!member) throw notFound("Project member");
  if (member.projectRole === "MANAGER" && (await managerCount(projectId)) <= 1) throw conflict("A project must keep at least one manager");
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { id: member.id } });
    await recordAudit({ actorId: actor.id, action: "project.member.remove", resourceType: "project", resourceId: projectId, metadata: { userId }, requestId: ctx.requestId, ipAddress: ctx.ip }, tx);
  });
}

/** Recent audit activity for a project, readable by any member. */
export async function projectActivity(actor: Actor, projectId: string, limit = 20) {
  await getProjectAccess(actor, projectId);
  const deviceIds = (await prisma.device.findMany({ where: { projectId }, select: { id: true } })).map((d) => d.id);
  return prisma.auditLog.findMany({
    where: { OR: [{ resourceType: "project", resourceId: projectId }, { resourceType: "device", resourceId: { in: deviceIds } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, action: true, outcome: true, createdAt: true, metadata: true, resourceType: true, actor: { select: { name: true } } },
  });
}
