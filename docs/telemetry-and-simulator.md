# Telemetry, alerts and the simulator

## Ingestion pipeline (`src/server/services/telemetry-ingest.ts`)

HTTP, MQTT and the simulator all call the same function. For each message:

1. **Authenticate** the device (identifier + secret; revoked or expired credentials fail). Disabled devices are refused. The device's protocol must match the transport.
2. **Rate-limit** per device (`INGEST_RATE_LIMIT_PER_MINUTE`, default 120 messages/min) and per IP for HTTP.
3. **Validate** the payload with Zod (1–100 readings, finite numbers, ISO-8601 timestamps).
4. Per reading (`src/lib/telemetry/ingest-policy.ts`):
   - the `sensorKey` must belong to an enabled sensor on this device;
   - the timestamp must lie within `TELEMETRY_MAX_FUTURE_SKEW_SECONDS` (default 300 s) ahead and `TELEMETRY_MAX_LATE_SECONDS` (default 7 days) behind;
   - a supplied unit is converted to the sensor's canonical unit (temperature, pressure, length, energy, power, speed, …; `src/lib/telemetry/measurements.ts`); the original value and unit are stored too, and the UI shows "Converted from X";
   - the converted value must be inside the sensor's `minValue`–`maxValue`.
   Rejected readings are reported individually; valid readings in the same message are still stored.
5. **Store** with `source` = `HTTP`, `MQTT` or `SIMULATED`. `(deviceId, messageId, sensorId)` is unique, so retries are counted as duplicates.
6. **Update device status** (`lastSeenAt`, status event on change) and **evaluate alert rules**.
7. **Publish** a realtime event (PostgreSQL `NOTIFY`) for live dashboards.

## Device status (`src/lib/telemetry/device-status.ts`)

Status comes only from received data, never from the device record existing:

| Status | Meaning |
|---|---|
| `UNKNOWN` | never sent anything |
| `ONLINE` | last message within the heartbeat timeout (device setting, else `DEVICE_HEARTBEAT_TIMEOUT_SECONDS`, default 120 s) |
| `DEGRADED` | online, but the latest message reported battery below 10 %, a device fault state, or contained only rejected readings |
| `OFFLINE` | nothing within the timeout — set by the worker's `health` job, which also raises/resolves `DEVICE_OFFLINE` alerts |
| `DISABLED` | deactivated by a manager; ingestion refused |

Every transition is recorded in `DeviceStatusEvent` (device page → Status history).

## Alert engine (`src/server/services/alert-engine.ts`, `src/lib/telemetry/alert-logic.ts`)

Rule conditions: `THRESHOLD_ABOVE`, `THRESHOLD_BELOW`, `OUTSIDE_RANGE`, `INSIDE_RANGE`, `STATE_EQUALS`, `BATTERY_LOW`, `DEVICE_OFFLINE`, `MISSING_READINGS`. A rule targets a project, optionally one device, and a sensor or measurement type.

- **Consecutive count:** the last N readings must all violate before an alert opens (filters single spikes).
- **Deduplication:** one open alert per (rule, device, sensor). Further violations increment `occurrenceCount` and update `lastTriggeredAt` instead of creating new alerts.
- **Cooldown:** after a resolve, the same target cannot re-open until the cooldown passes.
- **Auto-resolve** (optional per rule): offline alerts close when the device returns; missing-readings alerts close when data resumes.
- **Lifecycle:** `ACTIVE` → `ACKNOWLEDGED` → `RESOLVED`, each step with actor, time and optional note in the alert timeline. The rule's threshold is snapshotted on the alert so later rule edits do not rewrite history.
- **Notifications:** in-app for project members, filtered by each user's minimum severity; email when SMTP is configured (queued and retried by the worker). Alerts raised from simulated data are marked as simulated.

## Simulator (`src/lib/simulator/generator.ts`, `src/server/services/simulation.ts`)

Each project-type sensor template carries a simulation profile (`walk`, `wave` (daily cycle), `state`, `event`, `counter`, `drain` for batteries) with normal bounds and an abnormal value. Generators are seeded per device and sensor, so runs are reproducible.

Scenarios:

| Scenario | Behaviour |
|---|---|
| Normal operation | values follow normal profiles |
| Abnormal readings | values move into alert ranges to exercise rules |
| Mixed | about one tick in eight per device is abnormal (deterministic) |
| Device disconnect | one device stops reporting so it goes offline |
| Sensor dropout | one sensor stops reporting (exercises missing-readings rules) |

How it runs:

- A manager starts a session from the project's **Simulation** tab (or `POST /api/simulations` + `/start`). Sessions can be paused, resumed, reconfigured and stopped.
- The worker's `simulator` job ticks active sessions at their interval. Simulated devices are ordinary devices flagged as simulated and get their own credentials; each tick goes through the normal ingestion pipeline with deterministic message IDs, so a restarted worker never double-inserts.
- **History backfill** (`npm run simulator:history` or *Generate history*) writes labelled simulated readings for the past N hours (≤ 14 days, ≤ 10 devices).
- Every simulated reading has `source = SIMULATED`. Charts, tables, device pages, reports and CSV exports show it; reports can filter by source.
- The simulator is controlled by `ENABLE_SIMULATOR` and is refused in production unless `ALLOW_SIMULATOR_IN_PRODUCTION=true`.

## Analytics labels

The catalog labels each project type's analytics honestly as **Rule-based**, **Threshold monitoring** or **Statistical analysis**. No machine-learning model is included; "AI-Powered" in a project's name refers to the student project's title, and its project page shows the analytics label (Rule-based) plus a note on what the analytics actually do.

## Retention

The worker's `retention` job deletes telemetry older than the platform setting *Telemetry retention (days)* (unset = keep forever) in bounded batches, and applies the shorter *sensitive data retention* to the 7 project types flagged as sensitive (the health-related ones).
