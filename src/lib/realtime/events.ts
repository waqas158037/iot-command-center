import type { AlertSeverity, AlertStatus, DeviceStatus, TelemetrySource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";

export const REALTIME_CHANNEL = "icc_events";

export type RealtimeEvent =
  | {
      type: "telemetry";
      projectId: string;
      deviceId: string;
      source: TelemetrySource;
      readings: { sensorId: string; sensorKey: string; value: number; unit: string; occurredAt: string }[];
      receivedAt: string;
    }
  | { type: "alert"; projectId: string; alertId: string; severity: AlertSeverity; status: AlertStatus; title: string; deviceId: string | null }
  | { type: "device_status"; projectId: string; deviceId: string; status: DeviceStatus; previousStatus: DeviceStatus | null };

/**
 * Publishes an event through PostgreSQL NOTIFY so every app instance (and the SSE endpoint)
 * receives it no matter which process (web, worker, MQTT adapter) produced it.
 * NOTIFY payloads are limited to ~8 KB, so large telemetry batches are trimmed.
 */
export async function publishEvent(event: RealtimeEvent) {
  let payload = JSON.stringify(event);
  if (payload.length > 7500 && event.type === "telemetry") {
    payload = JSON.stringify({ ...event, readings: event.readings.slice(0, 40) });
  }
  try {
    await prisma.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${payload})`;
  } catch (err) {
    logger.warn({ err, type: event.type }, "failed to publish realtime event");
  }
}
