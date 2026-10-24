import { z } from "zod";
import { env } from "@/lib/env";
import { json, publicRoute } from "@/lib/http/handler";
import { safeEqualHex, sha256Hex } from "@/lib/crypto";
import { consumeRateLimit } from "@/lib/rate-limit";
import { authenticateDevice } from "@/server/services/telemetry-ingest";
import { hookAuthorized } from "@/lib/mqtt/hook-auth";

const schema = z.object({ username: z.string().max(64), password: z.string().max(200), clientid: z.string().max(128).optional() });

/**
 * HTTP authentication hook for an external broker (EMQX "HTTP Server" authenticator, or
 * mosquitto-go-auth http backend). The broker must send X-Hook-Secret: $MQTT_HOOK_SECRET.
 * Devices authenticate with username = deviceIdentifier, password = device secret.
 */
export const POST = publicRoute(async ({ req, ip }) => {
  if (!hookAuthorized(req)) return json({ result: "deny" }, 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ result: "deny" });
  const e = env();
  if (e.MQTT_USERNAME && body.data.username === e.MQTT_USERNAME) {
    const ok = Boolean(e.MQTT_PASSWORD) && safeEqualHex(sha256Hex(body.data.password), sha256Hex(e.MQTT_PASSWORD!));
    return json({ result: ok ? "allow" : "deny", is_superuser: false });
  }
  const limit = await consumeRateLimit(`mqtt:auth:${body.data.username}:${ip}`, 30, 60);
  if (!limit.allowed) return json({ result: "deny" });
  try {
    const device = await authenticateDevice(body.data.username, body.data.password);
    return json({ result: device.protocol === "MQTT" ? "allow" : "deny", is_superuser: false });
  } catch {
    return json({ result: "deny" });
  }
});
