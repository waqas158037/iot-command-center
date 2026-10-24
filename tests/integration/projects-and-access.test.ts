import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ZodError } from "zod";
import { AppError } from "@/lib/http/errors";
import { getProject, listProjects, updateProject, removeMember, updateMember, archiveProject, addMember } from "@/server/services/projects";
import { createDevice, getDevice, listDevices } from "@/server/services/devices";
import { listAlerts } from "@/server/services/alerts";
import { world } from "./helpers";

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (err) {
    if (err instanceof AppError) return err.status;
    if (err instanceof ZodError) return 400; // the HTTP layer maps validation errors to 400
    throw err;
  }
};

let w: Awaited<ReturnType<typeof world>>;
beforeAll(async () => {
  w = await world();
});

describe("project CRUD", () => {
  it("copies the template into the new project with its owner as manager and default rules", async () => {
    const p = await prisma.project.findUniqueOrThrow({ where: { id: w.project.id }, include: { members: true, alertRules: true } });
    expect((p.configuration as { sensors: unknown[] }).sensors.length).toBeGreaterThan(0);
    expect(p.members.find((m) => m.userId === w.manager.id)?.projectRole).toBe("MANAGER");
    expect(p.alertRules.length).toBeGreaterThan(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: "project.create", resourceId: w.project.id } });
    expect(audit).not.toBeNull();
  });

  it("rejects duplicate project codes and bad input", async () => {
    expect(await status(import("@/server/services/projects").then((m) => m.createProject(w.manager, { name: "Dup", projectCode: w.project.projectCode, projectTypeKey: "urban-air-quality" })))).toBe(409);
    expect(await status(import("@/server/services/projects").then((m) => m.createProject(w.manager, { name: "x", projectCode: "A", projectTypeKey: "urban-air-quality" })))).toBe(400);
  });

  it("validates per-project settings against the type schema", async () => {
    expect(await status(updateProject(w.manager, w.project.id, { settings: { unknownSetting: 1 } }))).toBe(400);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: w.other.id } });
    // Editing one project's configuration never changes another's.
    await updateProject(w.manager, w.project.id, { description: "changed" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: w.other.id } })).configuration).toEqual(p.configuration);
  });

  it("paginates and filters project lists to accessible projects", async () => {
    const mine = await listProjects(w.viewer, { pageSize: 1 });
    expect(mine.total).toBe(1);
    expect(mine.items[0].id).toBe(w.project.id);
    const all = await listProjects(w.admin, { pageSize: 1, page: 2 });
    expect(all.total).toBe(2);
    expect(all.items).toHaveLength(1);
    expect(all.totalPages).toBe(2);
  });
});

describe("cross-project isolation", () => {
  it("hides other teams' projects, devices and alerts as not found", async () => {
    expect(await status(getProject(w.outsider, w.project.id))).toBe(404);
    expect(await status(getDevice(w.outsider, w.http.device.id))).toBe(404);
    expect(await status(listDevices(w.outsider, { projectId: w.project.id }))).toBe(404);
    expect(await status(listAlerts(w.outsider, { projectId: w.project.id }))).toBe(404);
    expect((await listDevices(w.outsider, {})).items.some((d) => d.projectId === w.project.id)).toBe(false);
  });

  it("returns 403 for visible but forbidden actions", async () => {
    expect(await status(updateProject(w.viewer, w.project.id, { name: "Hacked" }))).toBe(403);
    expect(await status(createDevice(w.engineer, { projectId: w.project.id, name: "Rogue", protocol: "HTTP" }))).toBe(403);
    expect(await status(addMember(w.engineer, w.project.id, w.outsider.id, "VIEWER"))).toBe(403);
  });

  it("does not let a manager create devices in a project they are not in", async () => {
    expect(await status(createDevice(w.manager, { projectId: w.other.id, name: "Intruder", protocol: "HTTP" }))).toBe(404);
  });
});

describe("membership rules", () => {
  it("caps project roles by platform role and keeps one manager", async () => {
    expect(await status(updateMember(w.manager, w.project.id, w.viewer.id, "MANAGER"))).toBe(400);
    expect(await status(removeMember(w.manager, w.project.id, w.manager.id))).toBe(403); // owner
    expect(await status(updateMember(w.manager, w.project.id, w.manager.id, "VIEWER"))).toBe(409); // last manager
  });
});

describe("archiving", () => {
  it("makes a project read-only while keeping history", async () => {
    const tmp = await import("@/server/services/projects").then((m) => m.createProject(w.manager, { name: "Short lived", projectCode: `SL-${Date.now().toString(36)}`.slice(0, 20), projectTypeKey: "indoor-plant-irrigation" }));
    await archiveProject(w.manager, tmp.id);
    expect(await status(createDevice(w.manager, { projectId: tmp.id, name: "Late", protocol: "HTTP" }))).toBe(403);
    expect(await status(updateProject(w.manager, tmp.id, { name: "Renamed" }))).toBe(403);
    expect((await getProject(w.manager, tmp.id)).archivedAt).not.toBeNull();
    await updateProject(w.manager, tmp.id, { status: "ACTIVE" });
    expect((await getProject(w.manager, tmp.id)).archivedAt).toBeNull();
  });
});
