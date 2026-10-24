/**
 * Topic authorization shared by the development broker and the HTTP auth/ACL hooks for
 * external brokers (EMQX, mosquitto-go-auth).
 *
 * Topic convention: {prefix}/{deviceIdentifier}/telemetry   (device → platform)
 *                   {prefix}/{deviceIdentifier}/ack         (platform → device)
 */
export type MqttIdentity = { kind: "service" } | { kind: "device"; deviceIdentifier: string };
export type MqttAction = "publish" | "subscribe";

export function parseTelemetryTopic(topic: string, prefix = "devices"): string | null {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== prefix || parts[2] !== "telemetry") return null;
  const id = parts[1];
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(id) ? id : null;
}

export function mqttAllowed(identity: MqttIdentity, action: MqttAction, topic: string, prefix = "devices"): boolean {
  if (topic.includes("#") && action === "publish") return false;
  const parts = topic.split("/");
  if (identity.kind === "service") {
    // The platform worker reads all telemetry and writes acknowledgements; nothing else.
    if (action === "subscribe") return topic === `${prefix}/+/telemetry` || topic.startsWith(`$share/`) && topic.endsWith(`/${prefix}/+/telemetry`);
    return parts.length === 3 && parts[0] === prefix && parts[2] === "ack" && !parts[1].includes("+");
  }
  // Devices may only touch their own topics, and never use wildcards.
  if (topic.includes("+") || topic.includes("#") || topic.startsWith("$")) return false;
  if (parts.length !== 3 || parts[0] !== prefix || parts[1] !== identity.deviceIdentifier) return false;
  return action === "publish" ? parts[2] === "telemetry" : parts[2] === "ack";
}
