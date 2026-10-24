import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { PROJECT_TYPES, buildDefaultConfiguration, getProjectTypeTemplate } from "@/lib/project-types/registry";
import type { ProjectConfiguration } from "@/lib/project-types/types";

/** Inserts or refreshes every catalog entry. Idempotent; used by the seed script. */
export async function syncProjectTypes(tx: Tx = prisma) {
  for (const t of PROJECT_TYPES) {
    const data = {
      name: t.name,
      category: t.category,
      description: t.description,
      isSensitive: t.isSensitive,
      defaultConfiguration: buildDefaultConfiguration(t) as unknown as Prisma.InputJsonValue,
    };
    await tx.projectType.upsert({ where: { key: t.key }, create: { key: t.key, ...data }, update: data });
  }
  return PROJECT_TYPES.length;
}

export async function listProjectTypes() {
  const rows = await prisma.projectType.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map((r) => {
    const template = getProjectTypeTemplate(r.key);
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      category: r.category,
      description: r.description,
      isSensitive: r.isSensitive,
      analyticsLabel: template?.analyticsLabel,
      analyticsNote: template?.analyticsNote,
      deviceRequirements: template?.deviceRequirements ?? [],
      safetyNotice: template?.safetyNotice,
      configSchema: template?.configSchema ?? [],
      defaultConfiguration: r.defaultConfiguration as unknown as ProjectConfiguration,
    };
  });
}

export async function getProjectTypeByKey(key: string) {
  const all = await listProjectTypes();
  return all.find((t) => t.key === key) ?? null;
}
