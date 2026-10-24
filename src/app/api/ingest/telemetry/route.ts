import { env } from "@/lib/env";
import { badRequest, rateLimited, unauthenticated } from "@/lib/http/errors";
import { json, parseBody, publicRoute } from "@/lib/http/handler";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ingestPayloadSchema } from "@/lib/validation/schemas";
import { authenticateDevice, ingestTelemetry } from "@/server/services/telemetry-ingest";

/**
 * HTTP telemetry ingestion for devices that cannot use MQTT.
 *
 *   POST /api/ingest/telemetry
 *   X-Device-Id: <deviceIdentifier>
 *   Authorization: Bearer <device secret>
 *   { "messageId": "...", "timestamp": "...", "readings": [{ "sensorKey": "...", "value": 1.2, "unit": "°C" }] }
 *
 * Anonymous writes are impossible: the secret must match a non-revoked credential of that device,
 * and readings can only target that device's own sensors.
 */
export const POST = publicRoute(async ({ req, ip }) => {
  const ipLimit = await consumeRateLimit(`ingest:ip:${ip}`, 600, 60);
  if (!ipLimit.allowed) throw rateLimited(ipLimit.retryAfterSeconds);

  const deviceIdentifier = req.headers.get("x-device-id")?.trim() ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!deviceIdentifier || !secret) throw unauthenticated("X-Device-Id and Authorization: Bearer <secret> headers are required");

  let device;
  try {
    device = await authenticateDevice(deviceIdentifier, secret);
  } catch (err) {
    // Repeated bad credentials from one address are throttled harder.
    await consumeRateLimit(`ingest:authfail:${ip}`, 20, 300).then((r) => {
      if (!r.allowed) throw rateLimited(r.retryAfterSeconds);
    });
    throw err;
  }
  if (device.protocol !== "HTTP") throw badRequest(`This device is registered for ${device.protocol}; use that protocol`);

  const limit = await consumeRateLimit(`ingest:device:${device.id}`, env().INGEST_RATE_LIMIT_PER_MINUTE, 60);
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

  const payload = await parseBody(req, ingestPayloadSchema);
  const result = await ingestTelemetry(device, payload, "HTTP");
  if (result.accepted === 0 && result.duplicates === 0 && result.rejected.length > 0) {
    throw badRequest("No readings were accepted", { rejected: result.rejected });
  }
  return json(result, 200);
});
