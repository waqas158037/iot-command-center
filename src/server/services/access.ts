import type { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/http/errors";
import { canGlobal, canOnProject, type Actor, type GlobalAction, type ProjectAction, type ProjectContext } from "@/lib/permissions/policies";

export interface ProjectAccess extends ProjectContext {
  projectId: string;
  membershipRole: ProjectRole | null;
  isSensitive: boolean;
  isArchived: boolean;
}

/** Resolves the actor's relationship to a project. Missing or invisible projects both yield 404. */
export async function getProjectAccess(actor: Actor, projectId: string): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      archivedAt: true,
      projectType: { select: { isSensitive: true } },
      members: { where: { userId: actor.id }, select: { projectRole: true }, take: 1 },
    },
  });
  if (!project) throw notFound("Project");
  const access: ProjectAccess = {
    projectId: project.id,
    membershipRole: project.members[0]?.projectRole ?? null,
    isSensitive: project.projectType.isSensitive,
    isArchived: project.archivedAt !== null,
  };
  if (!canOnProject(actor, "project.view", access)) throw notFound("Project");
  return access;
}

export async function assertProjectAction(actor: Actor, projectId: string, action: ProjectAction): Promise<ProjectAccess> {
  const access = await getProjectAccess(actor, projectId);
  if (!canOnProject(actor, action, access)) throw forbidden();
  return access;
}

export function assertGlobal(actor: Actor, action: GlobalAction) {
  if (!canGlobal(actor, action)) throw forbidden();
}

/** Project IDs the actor may read; null means unrestricted (super admin). */
export async function accessibleProjectIds(actor: Actor): Promise<string[] | null> {
  if (actor.role === "SUPER_ADMIN") return null;
  const rows = await prisma.projectMember.findMany({ where: { userId: actor.id }, select: { projectId: true } });
  return rows.map((r) => r.projectId);
}

/** Prisma `where` fragment restricting a projectId column to accessible projects. */
export async function projectScope(actor: Actor, requestedProjectId?: string): Promise<{ projectId?: string | { in: string[] } }> {
  const ids = await accessibleProjectIds(actor);
  if (requestedProjectId) {
    if (ids && !ids.includes(requestedProjectId)) throw notFound("Project");
    return { projectId: requestedProjectId };
  }
  return ids ? { projectId: { in: ids } } : {};
}

export async function assertDeviceAction(actor: Actor, deviceId: string, action: ProjectAction) {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { id: true, projectId: true } });
  if (!device) throw notFound("Device");
  try {
    const access = await assertProjectAction(actor, device.projectId, action);
    return { device, access };
  } catch (err) {
    // Hide the existence of devices in projects the actor cannot see.
    if ((err as { status?: number }).status === 404) throw notFound("Device");
    throw err;
  }
}

export async function assertSensorAction(actor: Actor, sensorId: string, action: ProjectAction) {
  const sensor = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { id: true, deviceId: true, device: { select: { projectId: true } } } });
  if (!sensor) throw notFound("Sensor");
  try {
    const access = await assertProjectAction(actor, sensor.device.projectId, action);
    return { sensor, access };
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw notFound("Sensor");
    throw err;
  }
}

export async function assertAlertAction(actor: Actor, alertId: string, action: ProjectAction) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId }, select: { id: true, projectId: true } });
  if (!alert) throw notFound("Alert");
  try {
    const access = await assertProjectAction(actor, alert.projectId, action);
    return { alert, access };
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw notFound("Alert");
    throw err;
  }
}

export async function assertRuleAction(actor: Actor, ruleId: string, action: ProjectAction) {
  const rule = await prisma.alertRule.findUnique({ where: { id: ruleId }, select: { id: true, projectId: true } });
  if (!rule) throw notFound("Alert rule");
  try {
    const access = await assertProjectAction(actor, rule.projectId, action);
    return { rule, access };
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw notFound("Alert rule");
    throw err;
  }
}
