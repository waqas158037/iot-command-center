import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions/policies";
import { accessibleProjectIds } from "@/server/services/access";

/** Lightweight project options for selectors, scoped to what the actor may see. */
export async function projectOptions(actor: Actor) {
  const ids = await accessibleProjectIds(actor);
  const rows = await prisma.project.findMany({ where: { ...(ids ? { id: { in: ids } } : {}), archivedAt: null }, select: { id: true, name: true, projectCode: true }, orderBy: { name: "asc" } });
  return rows.map((p) => ({ value: p.id, label: `${p.name} (${p.projectCode})` }));
}

export async function deviceOptions(actor: Actor, projectId?: string) {
  const ids = await accessibleProjectIds(actor);
  if (projectId && ids && !ids.includes(projectId)) return [];
  const rows = await prisma.device.findMany({ where: projectId ? { projectId } : ids ? { projectId: { in: ids } } : {}, select: { id: true, name: true, deviceIdentifier: true }, orderBy: { name: "asc" }, take: 200 });
  return rows.map((d) => ({ value: d.id, label: `${d.name} · ${d.deviceIdentifier}` }));
}

import { notFound } from "next/navigation";
import { AppError } from "@/lib/http/errors";

/** Converts service-layer 404s into the Next.js not-found page; other errors propagate. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof AppError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}

export function isForbidden(err: unknown) {
  return err instanceof AppError && err.status === 403;
}
