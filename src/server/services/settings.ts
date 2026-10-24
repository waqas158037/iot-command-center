import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env, simulatorAllowed, smtpConfigured } from "@/lib/env";
import type { Actor } from "@/lib/permissions/policies";
import { assertGlobal } from "./access";
import { recordAudit } from "./audit";

export const platformSettingsSchema = z.object({
  organizationName: z.string().trim().min(1).max(120).default("IoT Command Center"),
  telemetryRetentionDays: z.coerce.number().int().min(0).max(3650).default(365),
  sensitiveDataRetentionDays: z.coerce.number().int().min(1).max(3650).default(90),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

const KEY = "platform";

export async function getSettings(): Promise<PlatformSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const parsed = platformSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : platformSettingsSchema.parse({});
}

export async function updateSettings(actor: Actor, input: unknown, ctx: { requestId?: string; ip?: string } = {}) {
  assertGlobal(actor, "settings.manage");
  const current = await getSettings();
  const next = platformSettingsSchema.parse({ ...current, ...(input as object) });
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as Prisma.InputJsonValue, updatedById: actor.id }, update: { value: next as Prisma.InputJsonValue, updatedById: actor.id } });
  await recordAudit({ actorId: actor.id, action: "settings.update", resourceType: "settings", resourceId: KEY, metadata: { before: current, after: next }, requestId: ctx.requestId, ipAddress: ctx.ip });
  return next;
}

/** Read-only integration status for the settings page. Never includes secret values. */
export function integrationStatus() {
  const e = env();
  return {
    mqtt: { configured: Boolean(e.MQTT_BROKER_URL), brokerUrl: e.MQTT_BROKER_URL ? e.MQTT_BROKER_URL.replace(/\/\/[^@]*@/, "//***@") : null, topicPrefix: e.MQTT_TOPIC_PREFIX, tls: Boolean(e.MQTT_BROKER_URL?.startsWith("mqtts")) },
    smtp: { configured: smtpConfigured(), host: e.SMTP_HOST ?? null },
    simulator: { enabled: simulatorAllowed() },
    registration: { enabled: e.ENABLE_REGISTRATION },
    httpIngestion: { endpoint: `${e.APP_URL}/api/ingest/telemetry` },
    heartbeatTimeoutSeconds: e.DEVICE_HEARTBEAT_TIMEOUT_SECONDS,
  };
}
