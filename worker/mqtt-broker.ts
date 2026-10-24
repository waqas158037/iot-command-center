/**
 * Development MQTT broker (Aedes) with database-backed device authentication and topic ACLs.
 * Devices connect with username = deviceIdentifier and password = device secret.
 * The platform worker connects with MQTT_USERNAME / MQTT_PASSWORD.
 *
 *   npm run mqtt:broker      # listens on MQTT_BROKER_PORT (default 1883)
 *
 * For production use a hardened broker (EMQX, Mosquitto + go-auth) with TLS and point its HTTP
 * auth/ACL hooks at /api/mqtt/auth and /api/mqtt/acl.
 */
import "dotenv/config";
import { createServer } from "node:net";
import { Aedes, type Client } from "aedes";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { mqttAllowed, type MqttIdentity } from "@/lib/mqtt/acl";
import { authenticateDevice } from "@/server/services/telemetry-ingest";

const log = logger.child({ component: "dev-broker" });
const identities = new WeakMap<Client, MqttIdentity>();

function authError(): Error & { returnCode: 4 } {
  return Object.assign(new Error("Bad username or password"), { returnCode: 4 as const });
}

async function main() {
  const e = env();
  if (!e.MQTT_USERNAME || !e.MQTT_PASSWORD) throw new Error("Set MQTT_USERNAME and MQTT_PASSWORD for the worker's service account");
  const prefix = e.MQTT_TOPIC_PREFIX;

  const broker = await Aedes.createBroker({
    authenticate: (client, username, password, done) => {
      const pass = password?.toString("utf8") ?? "";
      if (username === e.MQTT_USERNAME && pass === e.MQTT_PASSWORD) {
        identities.set(client, { kind: "service" });
        return done(null, true);
      }
      authenticateDevice(username ?? "", pass)
        .then((device) => {
          if (device.protocol !== "MQTT") throw new Error("not an MQTT device");
          identities.set(client, { kind: "device", deviceIdentifier: device.deviceIdentifier });
          done(null, true);
        })
        .catch(() => {
          log.warn({ username }, "MQTT authentication failed");
          done(authError(), false);
        });
    },
    authorizePublish: (client, packet, cb) => {
      const id = client ? identities.get(client) : undefined;
      if (!id || !mqttAllowed(id, "publish", packet.topic, prefix)) {
        log.warn({ topic: packet.topic, clientId: client?.id }, "publish denied");
        return cb(new Error("Not authorized"));
      }
      cb(null);
    },
    authorizeSubscribe: (client, sub, cb) => {
      const id = identities.get(client);
      if (!id || !mqttAllowed(id, "subscribe", sub.topic, prefix)) {
        log.warn({ topic: sub.topic, clientId: client.id }, "subscribe denied");
        return cb(new Error("Not authorized"));
      }
      cb(null, sub);
    },
  });

  const server = createServer(broker.handle);
  server.listen(e.MQTT_BROKER_PORT, () => log.info({ port: e.MQTT_BROKER_PORT }, "development MQTT broker listening"));
  const stop = () => server.close(() => broker.close(() => process.exit(0)));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  log.error({ err }, "broker failed to start");
  process.exit(1);
});
