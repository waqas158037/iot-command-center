# REST API

All endpoints return JSON. Errors have the shape `{ "error": { "code", "message", "details?" }, "requestId" }`.
Validation errors are `400` with field details; unauthenticated `401`; insufficient role `403`;
a project or resource the caller cannot access `404` (deliberately indistinguishable from "does not exist").

Session-authenticated endpoints use the Auth.js session cookie (sign in through `/login`). Device
and broker endpoints use their own credentials, noted below. Permissions refer to `docs/architecture.md`.

| Method | Path | Who |
|---|---|---|
| GET | `/api/health` | public (liveness) |
| GET, POST | `/api/auth/*` | Auth.js |
| GET | `/api/project-types`, `/api/project-types/:key` | any signed-in user |
| GET / POST | `/api/projects` | list accessible / create: `SUPER_ADMIN`, `PROJECT_MANAGER` |
| GET / PATCH / DELETE | `/api/projects/:id` | view: member / edit: manager / DELETE archives the project (manager); projects are never hard-deleted through the API |
| GET / POST | `/api/projects/:id/members` | view: member / add: manager |
| PATCH / DELETE | `/api/projects/:id/members/:userId` | manager |
| GET / POST | `/api/devices` | list accessible / create: manager |
| GET / PATCH / DELETE | `/api/devices/:id` | view: member / edit: manager (engineer: firmware + heartbeat only) / delete: manager |
| POST | `/api/devices/:id/credentials/rotate` | manager — returns the new secret once; old one valid for the grace period |
| POST | `/api/devices/:id/credentials/revoke` | manager — revokes every credential immediately |
| GET / POST | `/api/devices/:id/sensors` | view: member / add: manager |
| GET | `/api/devices/:id/telemetry`, `/api/devices/:id/status-history` | member |
| GET / PATCH / DELETE | `/api/sensors/:id` | view: member / edit, delete: manager |
| GET | `/api/sensors/:id/readings` | member |
| GET | `/api/telemetry?projectId&deviceId&sensorId&from&to&bucket&limit` | member; `bucket` = raw, 1m, 5m, 15m, 1h, 6h, 1d, auto |
| POST | `/api/ingest/telemetry` | **device**: `X-Device-Id: <identifier>`, `Authorization: Bearer <secret>`; HTTP-protocol devices only |
| GET | `/api/monitoring/summary` | signed-in; scoped to accessible projects |
| GET | `/api/monitoring/realtime` | SSE stream (`telemetry`, `alert`, `device_status` events), filtered per user |
| GET / POST | `/api/alert-rules` | view: member / create: manager |
| GET / PATCH / DELETE | `/api/alert-rules/:id` | view: member / edit, delete: manager |
| GET | `/api/alerts` | member; filters: project, status, severity, device, range |
| GET / PATCH | `/api/alerts/:id` | view: member / acknowledge, resolve, note: engineer |
| GET / PATCH | `/api/notifications`, `/api/notifications/:id` | own notifications |
| POST | `/api/notifications/mark-all-read` | own notifications |
| GET | `/api/reports/summary`, `/telemetry`, `/devices`, `/alerts` | member (results limited to accessible projects) |
| GET | `/api/reports/export?report=telemetry\|devices\|alerts&...` | engineer (manager for sensitive project types); CSV, formula-injection safe, simulated rows labelled |
| GET / POST | `/api/simulations` | view: member / create: manager |
| PATCH | `/api/simulations/:id` | manager (pause, resume, change scenario) |
| POST | `/api/simulations/:id/start`, `/stop` | manager |
| POST | `/api/simulations/history` | manager — backfill (≤ 14 days, ≤ 10 devices) |
| GET | `/api/users` | `SUPER_ADMIN` |
| PATCH | `/api/users/:id` | `SUPER_ADMIN` (role, active); you cannot change your own role or deactivate yourself, and the last active super admin cannot be demoted or deactivated |
| POST | `/api/users/invitations` | `SUPER_ADMIN` |
| GET | `/api/audit-logs` | `SUPER_ADMIN` |
| GET / PATCH | `/api/settings` | `SUPER_ADMIN` |
| POST | `/api/mqtt/auth`, `/api/mqtt/acl` | **broker**: `X-Hook-Secret: <MQTT_HOOK_SECRET>` |

Simulator endpoints return `403 FEATURE_DISABLED` when the simulator is turned off for the deployment.

### Ingestion example

```bash
curl -X POST http://localhost:3000/api/ingest/telemetry \
  -H "X-Device-Id: shems-demo-meter-1-x2c4" \
  -H "Authorization: Bearer icc_dev_..." \
  -H "Content-Type: application/json" \
  -d '{"messageId":"m-1","readings":[{"sensorKey":"power","value":1520,"unit":"W"},{"sensorKey":"temperature","value":77,"unit":"°F"}]}'
# → 200 {"accepted":2,"duplicates":0,"rejected":[],...}   (77 °F stored as 25 °C, original kept)
```
