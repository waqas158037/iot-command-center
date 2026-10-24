# Connecting hardware over MQTT

## Contract

| Item | Value |
|---|---|
| Broker | `MQTT_BROKER_URL` (dev: `mqtt://<host>:1883`; production: `mqtts://` with TLS) |
| Username | the device **identifier** shown on the device page (e.g. `ffd-demo-node-1-a3k9`) |
| Password | the device **secret**, shown once at creation or rotation |
| Publish | `devices/<identifier>/telemetry`, QoS 1 recommended |
| Subscribe (optional) | `devices/<identifier>/ack` |
| Allowed | only those two topics. Anything else (other devices, wildcards, `$SYS`) is denied and the client is disconnected |

Payload (max 100 readings per message):

```json
{
  "messageId": "esp32-a3k9-000123",
  "timestamp": "2026-10-24T12:00:00Z",
  "readings": [
    { "sensorKey": "temperature", "value": 24.6, "unit": "°C" },
    { "sensorKey": "humidity", "value": 58.2 },
    { "sensorKey": "smoke", "value": 410, "timestamp": "2026-10-24T11:59:58Z" }
  ]
}
```

- `sensorKey` must match a sensor configured on the device (see the device's Sensors tab).
- `unit` is optional; when given it is converted to the sensor's unit (e.g. °F → °C) and the original value is kept.
- `timestamp` is optional (per message or per reading); the server time is used when absent. Timestamps more than `TELEMETRY_MAX_FUTURE_SKEW_SECONDS` in the future or older than `TELEMETRY_MAX_LATE_SECONDS` are rejected.
- `messageId` makes retries safe: a repeated `(device, messageId, sensor)` is counted as a duplicate, not stored twice. Devices without a clock should still send an increasing counter.
- Ack: `{ "ok": true, "messageId": "...", "accepted": 2, "duplicates": 0, "rejected": [ { "sensorKey": "x", "reason": "..." } ] }`.

## ESP32 example (Arduino core, PubSubClient, ArduinoJson 7)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// Fill these in on the device only. Never commit real credentials.
const char* WIFI_SSID   = "your-wifi";
const char* WIFI_PASS   = "your-wifi-password";
const char* MQTT_HOST   = "192.168.1.10";      // machine running the broker
const int   MQTT_PORT   = 1883;                // 8883 with WiFiClientSecure for TLS
const char* DEVICE_ID   = "ffd-demo-node-1-a3k9";
const char* DEVICE_SECRET = "icc_dev_...";

DHT dht(4, DHT22);
WiFiClient net;
PubSubClient mqtt(net);
uint32_t counter = 0;
String topicTelemetry = String("devices/") + DEVICE_ID + "/telemetry";
String topicAck       = String("devices/") + DEVICE_ID + "/ack";

void onAck(char* topic, byte* payload, unsigned int len) {
  Serial.printf("ack: %.*s\n", len, (char*)payload);
}

void connectMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID, DEVICE_ID, DEVICE_SECRET)) {
      mqtt.subscribe(topicAck.c_str(), 1);
    } else {
      Serial.printf("mqtt connect failed rc=%d, retrying\n", mqtt.state());
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
  mqtt.setCallback(onAck);
}

void loop() {
  connectMqtt();
  mqtt.loop();
  static uint32_t last = 0;
  if (millis() - last < 10000) return;
  last = millis();

  JsonDocument doc;
  doc["messageId"] = String(DEVICE_ID) + "-" + String(++counter);
  JsonArray readings = doc["readings"].to<JsonArray>();
  float t = dht.readTemperature(), h = dht.readHumidity();
  if (!isnan(t)) { JsonObject r = readings.add<JsonObject>(); r["sensorKey"] = "temperature"; r["value"] = t; r["unit"] = "°C"; }
  if (!isnan(h)) { JsonObject r = readings.add<JsonObject>(); r["sensorKey"] = "humidity"; r["value"] = h; }
  JsonObject s = readings.add<JsonObject>(); s["sensorKey"] = "smoke"; s["value"] = analogRead(34);  // MQ-2 raw ADC

  char buf[768];
  size_t n = serializeJson(doc, buf);
  mqtt.publish(topicTelemetry.c_str(), (uint8_t*)buf, n, false);
}
```

Readings from real hardware are stored with source `MQTT` (or `HTTP`) and are never labelled simulated. Raw sensors such as the MQ-2 are uncalibrated; the catalog describes them as raw ADC values, not ppm.

## Testing without hardware

```bash
DEVICE_ID=<identifier> DEVICE_SECRET=<secret> npm run mqtt:demo-device -- \
  --sensor temperature=24.5 --sensor humidity=55 --count 5 --interval 2
```

The demo device uses the real path, so its readings are labelled `MQTT`. Register it as a clearly named test device.

## Brokers

**Development:** `npm run mqtt:broker` runs Aedes on `MQTT_BROKER_PORT`, authenticating devices against the database and enforcing the topic ACL. The worker (`npm run worker`) connects with `MQTT_USERNAME` / `MQTT_PASSWORD` and subscribes to `devices/+/telemetry`. No TLS: use only on a trusted network.

**Production (recommended: EMQX 5):**

1. Enable TLS listeners (8883) with a real certificate; set `MQTT_BROKER_URL=mqtts://broker:8883` and, for a private CA, `MQTT_CA_FILE`.
2. Authentication → *HTTP Server*: `POST https://<app>/api/mqtt/auth`, body `{"username":"${username}","password":"${password}","clientid":"${clientid}"}`, header `X-Hook-Secret: <MQTT_HOOK_SECRET>`. The app answers `{"result":"allow"|"deny"}`.
3. Authorization → *HTTP Server*: `POST https://<app>/api/mqtt/acl`, body `{"username":"${username}","topic":"${topic}","action":"${action}"}`, same header. Set "no match" to **deny**.
4. Disable anonymous access. Run the worker with `WORKER_JOBS` including `mqtt`.

Mosquitto works the same way with the `mosquitto-go-auth` HTTP backend. These external-broker hooks are implemented and unit-tested at the ACL level, but were only exercised end to end with the bundled Aedes broker.
