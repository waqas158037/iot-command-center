/**
 * Minimal MQTT device for testing the full hardware path (broker → worker → ingestion → alerts).
 * It behaves like the ESP32 example in docs/mqtt-esp32.md. Its readings are labelled MQTT, not
 * SIMULATED, because they arrive over the real device path — use it only for testing, and
 * register it as a test device so nobody mistakes the values for field measurements.
 *
 *   DEVICE_ID=... DEVICE_SECRET=... npm run mqtt:demo-device -- --sensor temperature=24.5 --sensor humidity=55 --count 5
 *
 * Options: --broker mqtt://localhost:1883  --interval 5  --count 0 (0 = forever)
 *          --sensor key=value (repeatable; value gets ±2% jitter)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import mqtt from "mqtt";

function args() {
  const out: { broker: string; interval: number; count: number; sensors: [string, number][] } = {
    broker: process.env.MQTT_BROKER_URL ?? "mqtt://localhost:1883",
    interval: 5,
    count: 0,
    sensors: [],
  };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const v = a[i + 1];
    if (a[i] === "--broker") out.broker = v;
    else if (a[i] === "--interval") out.interval = Number(v);
    else if (a[i] === "--count") out.count = Number(v);
    else if (a[i] === "--sensor") {
      const [k, n] = v.split("=");
      out.sensors.push([k, Number(n)]);
    } else continue;
    i++;
  }
  if (out.sensors.length === 0) out.sensors.push(["temperature", 24], ["humidity", 50]);
  return out;
}

const id = process.env.DEVICE_ID;
const secret = process.env.DEVICE_SECRET;
if (!id || !secret) {
  console.error("Set DEVICE_ID and DEVICE_SECRET (shown once when the device was registered).");
  process.exit(1);
}
const opts = args();
const prefix = process.env.MQTT_TOPIC_PREFIX ?? "devices";
const client = mqtt.connect(opts.broker, { username: id, password: secret, clientId: `${id}-${randomUUID().slice(0, 6)}`, reconnectPeriod: 2000 });
let sent = 0;

client.on("connect", () => {
  console.log(`connected to ${opts.broker} as ${id}`);
  client.subscribe(`${prefix}/${id}/ack`, (err) => err && console.error("ack subscribe failed:", err.message));
  const tick = () => {
    const payload = {
      messageId: `demo-${Date.now()}`,
      timestamp: new Date().toISOString(),
      readings: opts.sensors.map(([sensorKey, base]) => ({ sensorKey, value: Math.round(base * (1 + (Math.random() - 0.5) * 0.04) * 100) / 100 })),
    };
    client.publish(`${prefix}/${id}/telemetry`, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) console.error("publish failed:", err.message);
      else console.log("published", JSON.stringify(payload.readings));
    });
    sent++;
    if (opts.count && sent >= opts.count) setTimeout(() => client.end(false, {}, () => process.exit(0)), 3000);
  };
  tick();
  if (opts.count !== 1) {
    const timer = setInterval(() => (opts.count && sent >= opts.count ? clearInterval(timer) : tick()), opts.interval * 1000);
  }
});
client.on("message", (topic, msg) => console.log("ack:", msg.toString()));
client.on("error", (err) => console.error("mqtt error:", err.message));
client.on("close", () => console.log("connection closed"));
