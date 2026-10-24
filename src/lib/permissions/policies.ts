import type { ProjectRole, UserRole } from "@prisma/client";

/**
 * Pure authorization policies. They never touch the database so they can be unit tested
 * exhaustively; server code resolves the actor's membership and passes it in.
 *
 * Model:
 *  - Global role caps what a user can ever do (a global VIEWER is read-only everywhere).
 *  - Project membership grants access to one project. SUPER_ADMIN needs no membership.
 *  - Effective project role = min(project role, cap from global role).
 */

export interface Actor {
  id: string;
  role: UserRole;
  isActive: boolean;
}

export type ProjectAction =
  | "project.view"
  | "project.update"
  | "project.archive"
  | "project.members.manage"
  | "device.create"
  | "device.update"
  | "device.configure"
  | "device.credentials.manage"
  | "device.deactivate"
  | "sensor.manage"
  | "telemetry.view"
  | "telemetry.export"
  | "alertRule.manage"
  | "alert.view"
  | "alert.acknowledge"
  | "alert.resolve"
  | "alert.note"
  | "report.view"
  | "report.export"
  | "simulation.control";

export type GlobalAction =
  | "project.create"
  | "users.view"
  | "users.manage"
  | "audit.view"
  | "settings.manage"
  | "projectTypes.manage"
  | "analytics.global";

const PROJECT_ROLE_RANK: Record<ProjectRole, number> = { VIEWER: 1, ENGINEER: 2, MANAGER: 3 };

const GLOBAL_CAP: Record<UserRole, ProjectRole> = {
  SUPER_ADMIN: "MANAGER",
  PROJECT_MANAGER: "MANAGER",
  ENGINEER: "ENGINEER",
  VIEWER: "VIEWER",
};

const REQUIRED_PROJECT_ROLE: Record<ProjectAction, ProjectRole> = {
  "project.view": "VIEWER",
  "telemetry.view": "VIEWER",
  "alert.view": "VIEWER",
  "report.view": "VIEWER",
  "device.configure": "ENGINEER",
  "alert.acknowledge": "ENGINEER",
  "alert.resolve": "ENGINEER",
  "alert.note": "ENGINEER",
  "telemetry.export": "ENGINEER",
  "report.export": "ENGINEER",
  "project.update": "MANAGER",
  "project.archive": "MANAGER",
  "project.members.manage": "MANAGER",
  "device.create": "MANAGER",
  "device.update": "MANAGER",
  "device.credentials.manage": "MANAGER",
  "device.deactivate": "MANAGER",
  "sensor.manage": "MANAGER",
  "alertRule.manage": "MANAGER",
  "simulation.control": "MANAGER",
};

/** Actions on health/biometric projects that need a stronger role than usual. */
const SENSITIVE_OVERRIDES: Partial<Record<ProjectAction, ProjectRole>> = {
  "telemetry.export": "MANAGER",
  "report.export": "MANAGER",
};

const GLOBAL_ACTIONS: Record<GlobalAction, UserRole[]> = {
  "project.create": ["SUPER_ADMIN", "PROJECT_MANAGER"],
  "users.view": ["SUPER_ADMIN", "PROJECT_MANAGER"],
  "users.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN"],
  "settings.manage": ["SUPER_ADMIN"],
  "projectTypes.manage": ["SUPER_ADMIN"],
  "analytics.global": ["SUPER_ADMIN"],
};

export function effectiveProjectRole(actor: Actor, membershipRole: ProjectRole | null): ProjectRole | null {
  if (!actor.isActive) return null;
  if (actor.role === "SUPER_ADMIN") return "MANAGER";
  if (!membershipRole) return null;
  const cap = GLOBAL_CAP[actor.role];
  return PROJECT_ROLE_RANK[membershipRole] <= PROJECT_ROLE_RANK[cap] ? membershipRole : cap;
}

export interface ProjectContext {
  membershipRole: ProjectRole | null;
  isSensitive?: boolean;
  isArchived?: boolean;
}

const READ_ONLY_WHEN_ARCHIVED = new Set<ProjectAction>(["project.view", "telemetry.view", "alert.view", "report.view", "report.export", "telemetry.export"]);

export function canOnProject(actor: Actor, action: ProjectAction, ctx: ProjectContext): boolean {
  const role = effectiveProjectRole(actor, ctx.membershipRole);
  if (!role) return false;
  // Archived projects are read-only, except that managers may un-archive via project.update.
  if (ctx.isArchived && !READ_ONLY_WHEN_ARCHIVED.has(action) && action !== "project.update") return false;
  const required = (ctx.isSensitive && SENSITIVE_OVERRIDES[action]) || REQUIRED_PROJECT_ROLE[action];
  return PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[required];
}

export function canGlobal(actor: Actor, action: GlobalAction): boolean {
  return actor.isActive && GLOBAL_ACTIONS[action].includes(actor.role);
}

/** Which project roles a given actor may assign to members (prevents privilege escalation). */
export function assignableProjectRoles(actor: Actor, actorProjectRole: ProjectRole | null): ProjectRole[] {
  const role = effectiveProjectRole(actor, actorProjectRole);
  if (role !== "MANAGER") return [];
  return ["MANAGER", "ENGINEER", "VIEWER"];
}

/** Global roles an actor may grant. Only SUPER_ADMIN changes roles, and never their own. */
export function canChangeUserRole(actor: Actor, targetUserId: string, newRole: UserRole): boolean {
  if (!canGlobal(actor, "users.manage")) return false;
  if (actor.id === targetUserId) return false;
  return (["SUPER_ADMIN", "PROJECT_MANAGER", "ENGINEER", "VIEWER"] as UserRole[]).includes(newRole);
}

export function maxProjectRoleForUser(role: UserRole): ProjectRole {
  return GLOBAL_CAP[role];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  PROJECT_MANAGER: "Project manager",
  ENGINEER: "Engineer",
  VIEWER: "Viewer",
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  MANAGER: "Manager",
  ENGINEER: "Engineer",
  VIEWER: "Viewer",
};
