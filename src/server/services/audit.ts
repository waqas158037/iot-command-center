import type { AuditOutcome, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { logger } from "@/lib/logging/logger";

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ipAddress?: string | null;
}

const SENSITIVE_KEY = /pass|token|secret|hash|credential|cookie|authorization/i;

/** Drops credential-like keys and truncates long strings so audit rows never hold secrets. */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeAuditMetadata(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : sanitizeAuditMetadata(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) return value.slice(0, 500) + "…";
  if (typeof value === "bigint") return value.toString();
  return value;
}

export async function recordAudit(entry: AuditEntry, tx: Tx = prisma) {
  try {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome ?? "SUCCESS",
        metadata: entry.metadata ? (sanitizeAuditMetadata(entry.metadata) as Prisma.InputJsonValue) : undefined,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (err) {
    // Auditing must never take down the request it describes, but failures are always logged.
    logger.error({ err, action: entry.action }, "failed to write audit log");
    if (tx !== prisma) throw err;
  }
}
