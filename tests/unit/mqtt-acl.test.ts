import { describe, expect, it } from "vitest";
import { mqttAllowed, parseTelemetryTopic } from "@/lib/mqtt/acl";

const device = { kind: "device" as const, deviceIdentifier: "node-01" };
const service = { kind: "service" as const };

describe("MQTT topic ACL", () => {
  it("lets a device publish only its own telemetry and read only its own acks", () => {
    expect(mqttAllowed(device, "publish", "devices/node-01/telemetry")).toBe(true);
    expect(mqttAllowed(device, "publish", "devices/node-02/telemetry")).toBe(false);
    expect(mqttAllowed(device, "publish", "devices/node-01/ack")).toBe(false);
    expect(mqttAllowed(device, "subscribe", "devices/node-01/ack")).toBe(true);
    expect(mqttAllowed(device, "subscribe", "devices/node-01/telemetry")).toBe(false);
  });
  it("denies wildcards and system topics to devices", () => {
    expect(mqttAllowed(device, "subscribe", "devices/+/telemetry")).toBe(false);
    expect(mqttAllowed(device, "subscribe", "#")).toBe(false);
    expect(mqttAllowed(device, "subscribe", "$SYS/broker/clients")).toBe(false);
  });
  it("lets the service read all telemetry and publish acks only", () => {
    expect(mqttAllowed(service, "subscribe", "devices/+/telemetry")).toBe(true);
    expect(mqttAllowed(service, "subscribe", "$share/icc/devices/+/telemetry")).toBe(true);
    expect(mqttAllowed(service, "subscribe", "#")).toBe(false);
    expect(mqttAllowed(service, "publish", "devices/node-01/ack")).toBe(true);
    expect(mqttAllowed(service, "publish", "devices/node-01/telemetry")).toBe(false);
    expect(mqttAllowed(service, "publish", "devices/+/ack")).toBe(false);
  });
  it("respects a custom prefix and parses telemetry topics", () => {
    expect(mqttAllowed(device, "publish", "site/node-01/telemetry", "site")).toBe(true);
    expect(parseTelemetryTopic("devices/node-01/telemetry")).toBe("node-01");
    expect(parseTelemetryTopic("devices/node-01/telemetry/extra")).toBeNull();
    expect(parseTelemetryTopic("devices/../telemetry")).toBeNull();
  });
});
