import { describe, expect, it } from "vitest";
import { canChangeUserRole, canGlobal, canOnProject, effectiveProjectRole } from "@/lib/permissions/policies";

const actor = (role: "SUPER_ADMIN" | "PROJECT_MANAGER" | "ENGINEER" | "VIEWER", isActive = true) => ({ id: `u-${role}`, role, isActive });

describe("project permissions", () => {
  it("requires membership except for super admins", () => {
    expect(canOnProject(actor("PROJECT_MANAGER"), "project.view", { membershipRole: null })).toBe(false);
    expect(canOnProject(actor("SUPER_ADMIN"), "project.update", { membershipRole: null })).toBe(true);
  });
  it("caps the project role by the platform role", () => {
    expect(effectiveProjectRole(actor("VIEWER"), "MANAGER")).toBe("VIEWER");
    expect(effectiveProjectRole(actor("ENGINEER"), "MANAGER")).toBe("ENGINEER");
    expect(canOnProject(actor("VIEWER"), "device.create", { membershipRole: "MANAGER" })).toBe(false);
  });
  it("gives engineers operational but not administrative rights", () => {
    const ctx = { membershipRole: "ENGINEER" as const };
    expect(canOnProject(actor("ENGINEER"), "alert.acknowledge", ctx)).toBe(true);
    expect(canOnProject(actor("ENGINEER"), "device.configure", ctx)).toBe(true);
    expect(canOnProject(actor("ENGINEER"), "device.credentials.manage", ctx)).toBe(false);
    expect(canOnProject(actor("ENGINEER"), "project.members.manage", ctx)).toBe(false);
  });
  it("keeps viewers read-only", () => {
    const ctx = { membershipRole: "VIEWER" as const };
    expect(canOnProject(actor("VIEWER"), "telemetry.view", ctx)).toBe(true);
    expect(canOnProject(actor("VIEWER"), "alert.acknowledge", ctx)).toBe(false);
    expect(canOnProject(actor("VIEWER"), "report.export", ctx)).toBe(false);
  });
  it("requires managers to export health data", () => {
    expect(canOnProject(actor("ENGINEER"), "report.export", { membershipRole: "ENGINEER", isSensitive: true })).toBe(false);
    expect(canOnProject(actor("PROJECT_MANAGER"), "report.export", { membershipRole: "MANAGER", isSensitive: true })).toBe(true);
  });
  it("makes archived projects read-only apart from restoring", () => {
    const ctx = { membershipRole: "MANAGER" as const, isArchived: true };
    expect(canOnProject(actor("PROJECT_MANAGER"), "device.create", ctx)).toBe(false);
    expect(canOnProject(actor("PROJECT_MANAGER"), "report.view", ctx)).toBe(true);
    expect(canOnProject(actor("PROJECT_MANAGER"), "project.update", ctx)).toBe(true);
  });
  it("denies everything to inactive users", () => {
    expect(canOnProject(actor("SUPER_ADMIN", false), "project.view", { membershipRole: null })).toBe(false);
    expect(canGlobal(actor("SUPER_ADMIN", false), "users.manage")).toBe(false);
  });
});

describe("global permissions", () => {
  it("restricts administration to super admins", () => {
    expect(canGlobal(actor("SUPER_ADMIN"), "audit.view")).toBe(true);
    expect(canGlobal(actor("PROJECT_MANAGER"), "audit.view")).toBe(false);
    expect(canGlobal(actor("PROJECT_MANAGER"), "project.create")).toBe(true);
    expect(canGlobal(actor("ENGINEER"), "project.create")).toBe(false);
  });
  it("never lets a user change their own role", () => {
    const admin = actor("SUPER_ADMIN");
    expect(canChangeUserRole(admin, admin.id, "VIEWER")).toBe(false);
    expect(canChangeUserRole(admin, "someone", "ENGINEER")).toBe(true);
    expect(canChangeUserRole(actor("PROJECT_MANAGER"), "someone", "SUPER_ADMIN")).toBe(false);
  });
});
