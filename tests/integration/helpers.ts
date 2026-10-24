import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncProjectTypes } from "@/server/services/project-types";
import { createProject, addMember } from "@/server/services/projects";
import { createDevice } from "@/server/services/devices";

let n = 0;
const unique = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function makeUser(role: UserRole, isActive = true) {
  // Integration tests never authenticate with passwords, so no hash is stored.
  const u = await prisma.user.create({ data: { name: `${role} ${unique()}`, email: `${role.toLowerCase()}-${unique()}@test.local`, role, isActive } });
  return { id: u.id, role: u.role, isActive: u.isActive };
}

export async function world() {
  await syncProjectTypes();
  const admin = await makeUser("SUPER_ADMIN");
  const manager = await makeUser("PROJECT_MANAGER");
  const engineer = await makeUser("ENGINEER");
  const viewer = await makeUser("VIEWER");
  const outsider = await makeUser("PROJECT_MANAGER");
  const project = await createProject(manager, { name: "Air quality pilot", projectCode: `AQ-${unique()}`.slice(0, 20), projectTypeKey: "urban-air-quality", status: "ACTIVE" });
  const other = await createProject(outsider, { name: "Other team", projectCode: `OT-${unique()}`.slice(0, 20), projectTypeKey: "smart-door-lock", status: "ACTIVE" });
  await addMember(manager, project.id, engineer.id, "ENGINEER");
  await addMember(manager, project.id, viewer.id, "VIEWER");
  const http = await createDevice(manager, { projectId: project.id, name: "HTTP node", protocol: "HTTP" });
  return { admin, manager, engineer, viewer, outsider, project, other, http };
}

export function ingestRequest(deviceId: string, secret: string, body: unknown, ip = `10.0.0.${Math.floor(Math.random() * 250)}`) {
  return new Request("http://localhost/api/ingest/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": deviceId, authorization: `Bearer ${secret}`, "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
