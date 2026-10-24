# IoT Command Center

A multi-project IoT management platform built as a BSCS final-year project. One deployment manages
many IoT projects (16 project types ship in the catalog), each with its own members, devices,
sensors, telemetry, alert rules, dashboards and reports.

- **Stack:** Next.js 16 (App Router, React 19), PostgreSQL 16, Prisma 6, Auth.js v5, Tailwind v4, Recharts, MQTT (mqtt.js + Aedes dev broker), Vitest, Playwright.
- **Roles:** `SUPER_ADMIN`, `PROJECT_MANAGER`, `ENGINEER`, `VIEWER`, plus per-project roles (`MANAGER`, `ENGINEER`, `VIEWER`). Every check runs on the server.
- **Telemetry:** authenticated HTTP ingestion and MQTT, unit conversion, range and timestamp validation, idempotent message IDs, live updates over Server-Sent Events.
- **Simulator:** per-project sessions for all 16 types (normal, abnormal, mixed, device-disconnect and sensor-dropout scenarios). Simulated readings are stored with `source = SIMULATED` and badged everywhere they appear.

> Health-related projects (glucose, patient monitoring, medication, fall detection, posture, smart mirror) are **academic demonstrations, not medical devices**. The UI says so on every such project.

Further documentation lives in [`docs/`](docs):

| Doc | Contents |
|---|---|
| [architecture.md](docs/architecture.md) | Components, data model, RBAC, realtime, security model |
| [api.md](docs/api.md) | REST endpoints and their permissions |
| [telemetry-and-simulator.md](docs/telemetry-and-simulator.md) | Ingestion policy, device status, alert engine, simulator |
| [mqtt-esp32.md](docs/mqtt-esp32.md) | Connecting real hardware over MQTT, ESP32 sketch, broker options |
| [project-types.md](docs/project-types.md) | The 16-type catalog and how to add a type |
| [status.md](docs/status.md) | What is implemented, what was verified, and what is deferred |

---

## 1. Quick start (local development)

Requirements: Node.js 22+, npm 10+, PostgreSQL 16 (local install, or Docker for the bundled compose file).

```bash
npm ci
cp .env.example .env              # then edit: set AUTH_SECRET, MQTT_PASSWORD, MQTT_HOOK_SECRET
openssl rand -base64 32           # use the output as AUTH_SECRET

docker compose up -d db           # optional: PostgreSQL on :5432 (also creates the _test database)

npm run db:deploy                 # apply migrations
DEMO_PASSWORD='choose-a-demo-password' npm run db:seed   # 16 project types + demo data
npm run dev                       # http://localhost:3000
```

In a second and third terminal (optional, for MQTT and background jobs):

```bash
npm run mqtt:broker               # dev MQTT broker on :1883 with device auth + topic ACLs
npm run worker                    # simulator ticks, heartbeat/offline checks, missing-data alerts, MQTT adapter, email, retention
```

The seed creates `admin@demo.local`, `manager@demo.local`, `engineer@demo.local` and
`viewer@demo.local`, all using `DEMO_PASSWORD`. If `DEMO_PASSWORD` is empty the seed generates a
password and prints it once. **No password is committed anywhere.** Demo data is skipped when
`NODE_ENV=production` unless `SEED_DEMO_DATA=true`, and can be skipped anywhere with `SEED_DEMO_DATA=false`.

## 2. Administrator bootstrap

There is no default administrator account or password. Create the first super admin from the CLI:

```bash
# password from the environment
ADMIN_PASSWORD='a-strong-password' npm run admin:create -- --email you@example.com --name "Your Name"

# or from stdin (keeps it out of shell history)
printf '%s' "$PW" | npm run admin:create -- --email you@example.com --name "Your Name" --password-stdin

# or omit both: a strong password is generated and printed once
npm run admin:create -- --email you@example.com --name "Your Name"

# recovery: resets the password and signs out existing sessions
npm run admin:reset-password -- --email you@example.com
```

After that, the admin invites other users from **Team → Invite** (one-time invitation link; also
emailed when SMTP is configured) and assigns global roles. Self-registration is off unless
`ENABLE_REGISTRATION=true`, and self-registered users always start as `VIEWER`.

## 3. Starting simulated telemetry

1. Make sure `ENABLE_SIMULATOR=true` and the worker is running (`npm run worker`, or `npm run simulator` for only the simulator and health jobs).
2. Open a project → **Simulation** tab → choose devices, scenario (Normal operation, Abnormal readings, Mixed, Device disconnect, Sensor dropout) and interval → **Start**. Pause, resume, apply changes or stop from the same panel.
3. To backfill history for charts and reports: **Generate history** in the same tab, or
   ```bash
   npm run simulator:history -- --project FFD-DEMO --hours 48 --interval 10 --devices 2
   ```
   (project codes are shown on each project's overview page).

Simulated readings are stored with `source = SIMULATED`, shown with a "Simulated" badge, labelled in
CSV exports, and filterable in reports. Production deployments refuse simulator controls unless
`ALLOW_SIMULATOR_IN_PRODUCTION=true`.

## 4. Connecting an MQTT device

1. Register the device: **Devices → New device**, protocol **MQTT**. The secret is shown **once**; copy it then. Only a SHA-256 hash is stored, and it can be rotated (with a grace period) or revoked from the device page.
2. Connect to the broker with **username = device identifier**, **password = device secret**.
3. Publish JSON to `devices/<deviceIdentifier>/telemetry` (prefix configurable with `MQTT_TOPIC_PREFIX`):
   ```json
   { "messageId": "esp32-0001", "readings": [ { "sensorKey": "temperature", "value": 24.6, "unit": "°C" }, { "sensorKey": "humidity", "value": 58 } ] }
   ```
4. Subscribe to `devices/<deviceIdentifier>/ack` to receive `{ ok, accepted, duplicates, rejected[] }`.

Devices can only publish to their own telemetry topic and subscribe to their own ack topic; any
other topic is refused and the client is disconnected. Try it without hardware:

```bash
DEVICE_ID=<identifier> DEVICE_SECRET=<secret> npm run mqtt:demo-device -- --sensor temperature=24.5 --sensor humidity=55 --count 5
```

An ESP32 (Arduino / PubSubClient) sketch and the production broker setup (EMQX with HTTP auth hooks, TLS) are in [docs/mqtt-esp32.md](docs/mqtt-esp32.md).

**HTTP alternative** for HTTP-protocol devices:

```bash
curl -X POST http://localhost:3000/api/ingest/telemetry \
  -H "X-Device-Id: <identifier>" -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" \
  -d '{"readings":[{"sensorKey":"temperature","value":24.6}]}'
```

## 5. Full stack with Docker Compose

```bash
export AUTH_SECRET=$(openssl rand -base64 32) MQTT_PASSWORD=$(openssl rand -hex 16)
# optional demo data:
export SEED_DEMO_DATA=true DEMO_PASSWORD='choose-a-demo-password'
docker compose --profile app up --build -d
```

This runs PostgreSQL, a one-shot `migrate` job (`prisma migrate deploy` + seed), the web app on
:3000, the worker and the dev MQTT broker on :1883. Ports can be moved with `WEB_PORT`, `DB_PORT`
and `MQTT_PORT`. The containers run with `NODE_ENV=production`, so the simulator is disabled unless
you also export `ALLOW_SIMULATOR_IN_PRODUCTION=true`. Then create an admin inside the stack:

```bash
docker compose run --rm -e ADMIN_PASSWORD='a-strong-password' web npx tsx scripts/admin.ts create --email you@example.com --name "Your Name"
```

Behind a proxy that intercepts TLS, pass its CA to the build: `docker build --secret id=npm_ca,src=/path/ca.crt .`

## 6. Tests and checks

```bash
npm run lint
npm run typecheck
npm run build

npm test                      # unit tests (no database)
npm run test:integration      # migrates and uses TEST_DATABASE_URL (name must contain "test"; it is truncated)
npm run test:e2e              # Playwright, desktop + mobile; needs the seeded dev database
```

E2E notes: `DEMO_PASSWORD` must match the seeded demo users. Playwright starts `npm run dev`
itself, or set `E2E_BASE_URL=http://localhost:3000` to reuse a running server. The integration
suite refuses to run against any database whose name does not contain `test`.

## 7. Configuration

Every variable is documented in [`.env.example`](.env.example). The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing key (required, random) |
| `APP_URL` | Public URL, used in invitation and reset links |
| `ENABLE_SIMULATOR` / `ALLOW_SIMULATOR_IN_PRODUCTION` | Simulator switches |
| `DEVICE_HEARTBEAT_TIMEOUT_SECONDS` | Default offline threshold (devices can override) |
| `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | Worker's broker connection (leave the URL empty for HTTP-only) |
| `MQTT_HOOK_SECRET` | Shared secret for external broker auth/ACL hooks |
| `SMTP_*` | Optional email for notifications, invitations and password reset |

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL is required` / Prisma `P1001` | PostgreSQL is not running or the URL is wrong. `docker compose up -d db`, then `npm run db:deploy`. |
| Login says "Too many attempts" | Login is rate-limited (5 per email, 30 per IP, per 15 minutes). Wait, or in development clear the `RateLimitBucket` table. |
| Signed out right after a role or password change | Expected: changing a user's password, role or status invalidates their sessions. |
| Charts are empty | No telemetry in the selected range. Start a simulation or generate history, or widen the range. |
| Simulation starts but nothing arrives | The worker is not running (`npm run worker`), or `ENABLE_SIMULATOR=false`, or production without `ALLOW_SIMULATOR_IN_PRODUCTION=true`. |
| MQTT device gets "Bad username or password" | Use the device identifier (not its name) as username; the secret was rotated or revoked; or the device's protocol is not MQTT. |
| MQTT client disconnected after publishing | It published or subscribed outside `devices/<its id>/telemetry` / `devices/<its id>/ack`. |
| Readings rejected | Check the ack or HTTP 400 body: unknown or disabled sensor, value outside the sensor's range, unit that cannot be converted, or a timestamp too far in the future or past. |
| Device stays OFFLINE | No message within its heartbeat timeout; the worker's health job must be running to mark devices offline/online on schedule. |
| Integration tests refuse to start | `TEST_DATABASE_URL` must name a database containing "test". Create it: `createdb iot_command_center_test`. |
| `prisma migrate reset` | Destroys all data. Only run it on a development database, deliberately. |

## 9. Project layout

```
prisma/            schema, migrations, seed
src/app/           pages (App Router) and API route handlers
src/components/    UI components
src/lib/           env, auth, permissions, validation, telemetry logic, simulator, MQTT ACLs, realtime
src/server/        services (data access + business rules) and background jobs
worker/            background worker and dev MQTT broker
scripts/           admin CLI, simulator history, MQTT demo device, test DB preparation
tests/             unit, integration and e2e suites
docs/              documentation
```
