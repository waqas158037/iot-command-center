import { z } from "zod";
import { env } from "@/lib/env";
import { json, publicRoute } from "@/lib/http/handler";
import { mqttAllowed } from "@/lib/mqtt/acl";
import { hookAuthorized } from "@/lib/mqtt/hook-auth";

const schema = z.object({ username: z.string().max(64), topic: z.string().max(256), action: z.enum(["publish", "subscribe"]) });

/** HTTP authorization (ACL) hook: devices may only publish to their own telemetry topic. */
export const POST = publicRoute(async ({ req }) => {
  if (!hookAuthorized(req)) return json({ result: "deny" }, 403);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ result: "deny" });
  const e = env();
  const identity = e.MQTT_USERNAME && body.data.username === e.MQTT_USERNAME ? ({ kind: "service" } as const) : ({ kind: "device", deviceIdentifier: body.data.username } as const);
  return json({ result: mqttAllowed(identity, body.data.action, body.data.topic, e.MQTT_TOPIC_PREFIX) ? "allow" : "deny" });
});
