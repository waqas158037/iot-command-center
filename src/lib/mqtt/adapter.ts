import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import mqtt, { type MqttClient } from "mqtt";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ingestTelemetry } from "@/server/services/telemetry-ingest";
import { parseTelemetryTopic } from "./acl";
import { ZodError } from "zod";

const MAX_PAYLOAD_BYTES = 64 * 1024;
const log = logger.child({ component: "mqtt-adapter" });

/**
 * Subscribes to device telemetry with the platform's service account and feeds the shared
 * ingestion pipeline. Device identity is established by the broker (each device connects with
 * its identifier and secret; the ACL limits it to its own topic), and re-checked here.
 */
export function startMqttAdapter(): MqttClient | null {
  const e = env();
  if (!e.MQTT_BROKER_URL) {
    log.info("MQTT_BROKER_URL not set; MQTT adapter disabled");
    return null;
  }
  const prefix = e.MQTT_TOPIC_PREFIX;
  const subscription = process.env.MQTT_SHARED_GROUP ? `$share/${process.env.MQTT_SHARED_GROUP}/${prefix}/+/telemetry` : `${prefix}/+/telemetry`;
  let reconnectDelay = 1000;

  const client = mqtt.connect(e.MQTT_BROKER_URL, {
    clientId: `icc-worker-${hostname()}-${process.pid}`,
    username: e.MQTT_USERNAME,
    password: e.MQTT_PASSWORD,
    ca: e.MQTT_CA_FILE ? readFileSync(e.MQTT_CA_FILE) : undefined,
    rejectUnauthorized: e.MQTT_REJECT_UNAUTHORIZED,
    reconnectPeriod: reconnectDelay,
    connectTimeout: 10_000,
    clean: true,
  });

  client.on("connect", () => {
    reconnectDelay = 1000;
    client.options.reconnectPeriod = reconnectDelay;
    log.info({ broker: e.MQTT_BROKER_URL!.replace(/\/\/[^@]*@/, "//***@"), subscription }, "connected to MQTT broker");
    client.subscribe(subscription, { qos: 1 }, (err) => {
      if (err) log.error({ err }, "MQTT subscribe failed");
    });
  });
  client.on("reconnect", () => {
    // Bounded exponential backoff: 1s, 2s, 4s … capped at 30s.
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    client.options.reconnectPeriod = reconnectDelay;
    log.warn({ nextDelayMs: reconnectDelay }, "reconnecting to MQTT broker");
  });
  client.on("error", (err) => log.error({ err: { message: err.message } }, "MQTT client error"));
  client.on("offline", () => log.warn("MQTT client offline"));

  client.on("message", (topic, payload) => {
    void handleMessage(client, prefix, topic, payload);
  });
  return client;
}

export async function handleMessage(client: Pick<MqttClient, "publish"> | null, prefix: string, topic: string, payload: Buffer, receivedAt = new Date()) {
  const deviceIdentifier = parseTelemetryTopic(topic, prefix);
  if (!deviceIdentifier) {
    log.warn({ topic }, "ignored message on unexpected topic");
    return { status: "ignored" as const };
  }
  const ack = (body: Record<string, unknown>) => client?.publish(`${prefix}/${deviceIdentifier}/ack`, JSON.stringify(body), { qos: 0 });

  if (payload.length > MAX_PAYLOAD_BYTES) {
    log.warn({ deviceIdentifier, bytes: payload.length }, "rejected oversized MQTT payload");
    ack({ ok: false, error: "payload_too_large" });
    return { status: "rejected" as const, reason: "payload_too_large" };
  }
  const limit = await consumeRateLimit(`ingest:mqtt:${deviceIdentifier}`, env().INGEST_RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) {
    log.warn({ deviceIdentifier }, "MQTT ingestion rate limit exceeded");
    ack({ ok: false, error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds });
    return { status: "rejected" as const, reason: "rate_limited" };
  }

  let body: unknown;
  try {
    body = JSON.parse(payload.toString("utf8"));
  } catch {
    log.warn({ deviceIdentifier }, "rejected malformed MQTT JSON");
    ack({ ok: false, error: "malformed_json" });
    return { status: "rejected" as const, reason: "malformed_json" };
  }

  const device = await prisma.device.findUnique({ where: { deviceIdentifier }, select: { id: true, name: true, deviceIdentifier: true, projectId: true, protocol: true, status: true } });
  if (!device || device.protocol !== "MQTT" || device.status === "DISABLED") {
    log.warn({ deviceIdentifier }, "MQTT message from unknown, disabled or non-MQTT device");
    return { status: "rejected" as const, reason: "unknown_device" };
  }

  try {
    const result = await ingestTelemetry(device, body, "MQTT", receivedAt);
    ack({ ok: true, messageId: (body as { messageId?: string }).messageId ?? null, accepted: result.accepted, duplicates: result.duplicates, rejected: result.rejected });
    return { status: "ok" as const, result };
  } catch (err) {
    if (err instanceof ZodError) {
      log.warn({ deviceIdentifier, issues: err.issues.slice(0, 5) }, "rejected invalid MQTT payload");
      ack({ ok: false, error: "validation_failed", issues: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) });
      return { status: "rejected" as const, reason: "validation_failed" };
    }
    log.error({ err, deviceIdentifier }, "MQTT ingestion failed");
    ack({ ok: false, error: "ingestion_failed" });
    return { status: "error" as const };
  }
}
