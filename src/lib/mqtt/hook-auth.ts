import { env } from "@/lib/env";
import { safeEqualHex, sha256Hex } from "@/lib/crypto";

/** Broker → platform hook calls must carry the shared X-Hook-Secret. Disabled when unset. */
export function hookAuthorized(req: Request) {
  const secret = env().MQTT_HOOK_SECRET;
  const given = req.headers.get("x-hook-secret") ?? "";
  return Boolean(secret) && safeEqualHex(sha256Hex(given), sha256Hex(secret!));
}
