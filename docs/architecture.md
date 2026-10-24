# Architecture

## Components

```
 Browser ──HTTPS──▶ Next.js app (pages + /api route handlers) ──Prisma──▶ PostgreSQL
    ▲  SSE /api/monitoring/realtime            │   ▲                         │  LISTEN/NOTIFY "icc_events"
    └──────────────────────────────────────────┘   │                         ▼
                                                    │                 Realtime hub (one LISTEN per process)
 HTTP device ──POST /api/ingest/telemetry──────────┘
 MQTT device ──▶ MQTT broker ──▶ worker (MQTT adapter) ──▶ same ingestion service
                 (dev: Aedes;  prod: EMQX via /api/mqtt/auth + /api/mqtt/acl hooks)
 Worker jobs: simulator ticks · device health (online/offline) · missing-data rules · email · retention
```

- **Web app** (`src/app`): server components render every page; client components handle forms, charts and the live feed. Route handlers in `src/app/api` are thin: they authenticate, validate with Zod, and call a service.
- **Services** (`src/server/services`): all business rules and data access. Every service that touches project data takes the acting user and calls `assertProjectAction` / `accessibleProjectIds` first.
- **Ingestion** (`telemetry-ingest.ts`) is shared by HTTP, MQTT and the simulator, so validation, unit conversion, idempotency, status updates, alert evaluation and realtime events behave identically for every source. The `source` column (`HTTP`, `MQTT`, `SIMULATED`) records where a reading came from.
- **Worker** (`worker/index.ts`): each job runs under a PostgreSQL lease (`WorkerLease`), so several workers never duplicate work. `WORKER_JOBS` selects jobs.
- **Realtime**: services `NOTIFY icc_events` after commits. Each Next.js process holds one `LISTEN` connection and fans events out to SSE subscribers, filtering each event by the subscriber's accessible projects.

## Data model (Prisma, `prisma/schema.prisma`)

| Area | Models |
|---|---|
| Identity | `User` (global role, `sessionVersion`, preferences), `UserInvitation`, `PasswordResetToken`, `RateLimitBucket` |
| Catalog | `ProjectType` (synced from `src/lib/project-types/registry.ts`) |
| Projects | `Project` (type, status, settings JSON), `ProjectMember` (project role) |
| Devices | `Device` (identifier, protocol, status, heartbeat timeout), `DeviceCredential` (SHA-256 hash, prefix, version, expiry for rotation grace), `DeviceStatusEvent` |
| Telemetry | `Sensor` (key, measurement, unit, min/max, origin), `TelemetryReading` (value, original value/unit, source, quality flags, unique `(deviceId, messageId, sensorId)`) |
| Alerts | `AlertRule`, `Alert` (status, occurrence count, threshold snapshot), `AlertEvent` (timeline) |
| Notifications | `Notification`, `NotificationDelivery` (email queue) |
| Operations | `AuditLog`, `SimulationSession`, `AppSetting`, `WorkerLease` |

Readings are stored in UTC. Charts aggregate with `date_bin` into buckets chosen so a range shows at most ~150 points.

## Authorization

Implemented in `src/lib/permissions/policies.ts` (pure functions, exhaustively unit-tested) and enforced in services.

- **Global role** caps what a user can ever do: `SUPER_ADMIN` → manager everywhere (no membership needed); `PROJECT_MANAGER` → up to manager; `ENGINEER` → up to engineer; `VIEWER` → read-only.
- **Project role** (`MANAGER`, `ENGINEER`, `VIEWER`) grants access to one project. Effective role = min(project role, global cap).
- Viewer: view project, telemetry, alerts, reports. Engineer adds: acknowledge/resolve/annotate alerts, configure devices (firmware, heartbeat), export. Manager adds: edit/archive project, members, devices, credentials, sensors, alert rules, simulator.
- Global-only actions (create project, users, audit log, platform settings) are checked separately.
- A project the user cannot access returns **404**, not 403, so IDs cannot be probed.
- The role is read from the database on each request (sessions carry only the user ID and `sessionVersion`); a role, status or password change bumps `sessionVersion` and invalidates existing sessions.

## Security model

- Passwords: bcrypt; login rate-limited per email and per IP; generic error messages.
- Device secrets: 32 random bytes, shown once, stored as SHA-256 (high-entropy secrets, so a fast hash is appropriate), compared in constant time; rotation keeps the old credential valid for a grace period; revoke-all is immediate.
- Ingestion requires device credentials on every request; anonymous writes are impossible. HTTP ingestion is rate-limited per device.
- MQTT: devices may only publish to `<prefix>/<own id>/telemetry` and subscribe to `<prefix>/<own id>/ack`. Wildcards and other topics are denied (`src/lib/mqtt/acl.ts`).
- CSV exports neutralise formula injection (cells starting with `=`, `+`, `-`, `@`, tab, CR are prefixed with `'`).
- Audit log records security-relevant actions with actor, outcome, IP and request ID; secrets and passwords are never logged (pino redaction).
- Security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP) and `poweredByHeader: false` are set in `next.config.ts`. A Content-Security-Policy is not set yet (see `status.md`).

## Known limitations

- Sessions are JWTs. Signing out clears the cookie but does not revoke the token server-side; tokens are invalidated when `sessionVersion` changes (password, role or status change) or when they expire.
- The bundled Aedes broker is for development; use EMQX/Mosquitto with TLS in production (see `mqtt-esp32.md`).
- The realtime hub is per process; with several app instances each holds its own LISTEN connection (works, but is not a message bus).
