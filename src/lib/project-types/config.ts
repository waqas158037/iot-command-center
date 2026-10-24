import { z } from "zod";
import type { ConfigField, ProjectConfiguration } from "./types";
import { MEASUREMENTS } from "@/lib/telemetry/measurements";

/** Builds a strict Zod schema for a project's editable settings from its type's config schema. */
export function settingsSchemaFor(fields: ConfigField[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    switch (f.type) {
      case "number": {
        let n = z.coerce.number({ message: `${f.label} must be a number` });
        if (f.min !== undefined) n = n.min(f.min, `${f.label} must be at least ${f.min}`);
        if (f.max !== undefined) n = n.max(f.max, `${f.label} must be at most ${f.max}`);
        shape[f.key] = n;
        break;
      }
      case "boolean":
        shape[f.key] = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
        break;
      case "select":
        shape[f.key] = z.enum((f.options ?? [String(f.default)]) as [string, ...string[]]);
        break;
      default:
        shape[f.key] = z.string().trim().max(200);
    }
  }
  return z.object(shape).strict();
}

/** Structural validation of a stored configuration (used by tests and when templates are edited). */
export function validateConfiguration(config: ProjectConfiguration): string[] {
  const errors: string[] = [];
  const sensorKeys = new Set<string>();
  for (const s of config.sensors) {
    if (sensorKeys.has(s.key)) errors.push(`Duplicate sensor key "${s.key}"`);
    sensorKeys.add(s.key);
    if (!MEASUREMENTS[s.measurement]) errors.push(`Sensor "${s.key}" uses unknown measurement "${s.measurement}"`);
  }
  const unitOf = (key: string) => {
    const s = config.sensors.find((x) => x.key === key);
    return s ? MEASUREMENTS[s.measurement]?.canonicalUnit : undefined;
  };
  for (const w of config.widgets) {
    for (const k of w.sensorKeys) if (!sensorKeys.has(k)) errors.push(`Widget "${w.id}" references unknown sensor "${k}"`);
    const units = new Set(w.sensorKeys.map(unitOf));
    if (units.size > 1) errors.push(`Widget "${w.id}" mixes units (${[...units].join(", ")})`);
  }
  for (const r of config.alertRules) {
    if (r.sensorType && !MEASUREMENTS[r.sensorType]) errors.push(`Rule "${r.name}" uses unknown measurement "${r.sensorType}"`);
  }
  return errors;
}
