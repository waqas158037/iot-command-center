# Implementation status

Last verified 2026-10-24 in a Linux container (Node 22, PostgreSQL 16, Docker 29).

## Acceptance criteria (spec section 26)

| # | Criterion | Result | How it was checked |
|---|---|---|---|
| 1 | Application starts locally | ✅ | `npm run dev` and `next start`; `/api/health` → `{"status":"ok"}` |
| 2 | PostgreSQL initialises | ✅ | local PostgreSQL 16 and the compose `db` service (healthcheck passes, test DB created by init script) |
| 3 | Migrations succeed on a clean database | ✅ | `prisma migrate deploy` on an empty compose volume, and on the empty test database |
| 4 | All 16 project types seeded | ✅ | seed output "16 project types synchronised"; unit test asserts 16 unique keys |
| 5 | Authentication works | ✅ | e2e login/logout/wrong-password, rate limiting, password change signs out sessions |
| 6 | Server-side role and project authorization | ✅ | 9 policy unit tests over role × action tables; integration tests for role caps, 403s and hidden projects; e2e viewer has no write controls and gets 403/404 from the API |
| 7 | Projects created, edited, viewed, archived | ✅ | e2e (create from template, edit, archive → read-only); integration tests |
| 8 | Devices and sensors managed | ✅ | e2e device creation with one-time secret; integration tests for CRUD, rotation, revocation |
| 9 | Telemetry ingested and persisted | ✅ | HTTP (integration + e2e) and MQTT (manual end to end, locally and through Docker Compose) |
| 10 | Simulated readings clearly labelled | ✅ | `source = SIMULATED`, badges, CSV column; e2e checks the label |
| 11 | Historical readings in charts | ✅ | 24 h seeded history renders on dashboards and device pages (screenshots during development); bucketing unit-tested |
| 12 | Online/offline status correct | ✅ | unit tests for status computation; integration test marks silent devices offline and raises the offline rule; manual MQTT device went ONLINE |
| 13 | Threshold violations raise alerts | ✅ | unit tests (consecutive, cooldown, ranges); integration + e2e (PM2.5 rule after 3 readings); MQTT smoke alert with dedup |
| 14 | Alerts acknowledged and resolved | ✅ | e2e and integration tests, with timeline entries |
| 15 | Reports filtered and exported | ✅ | e2e filters by project and downloads CSV; formula-injection unit tests |
| 16 | Dashboards use the project's sensor definitions | ✅ | widgets resolved from each project's copied template; unit tests validate widget ↔ sensor references |
| 17 | Cross-project access denied | ✅ | integration tests return 404 for other projects' devices, alerts, telemetry and exports; e2e viewer check |
| 18 | Secrets not exposed to the frontend | ✅ | secret returned only in the create/rotate response; only the hash is stored (integration test); device and credential responses omit hashes; log redaction |
| 19 | Responsive desktop and mobile | ✅ | Playwright mobile project (Pixel 7) plus manual phone-width screenshots during development |
| 20 | Automated tests cover critical workflows | ✅ | 65 unit, 26 integration, 14 e2e — all passing |
| 21 | Lint, TypeScript and production build pass | ✅ | `npm run lint` (0 errors, 1 accepted warning), `npm run typecheck`, `npm run build` |
| 22 | Setup and troubleshooting docs | ✅ | README sections 1–8 and this folder |

## Verified but with limits

- **Docker Compose** was built and run once here: migrations, seed, web, worker and broker all started, and an MQTT device published through it. Building inside this sandbox needed a proxy CA build secret (documented in the README); a normal machine should not need it.
- **External brokers** (EMQX/Mosquitto via `/api/mqtt/auth` and `/api/mqtt/acl`): the hooks are implemented and the ACL logic is unit-tested, but they were not run against a real EMQX instance.
- **Email** (alert notifications, invitations, password reset): implemented with nodemailer and a retrying delivery queue, but not tested against a real SMTP server. Without SMTP, notifications are in-app only and password resets go through an administrator (`npm run admin:reset-password` or the Team page).
- **Real hardware**: the ESP32 sketch in `mqtt-esp32.md` was not flashed to a device; the MQTT path was exercised with `npm run mqtt:demo-device`, which uses the same protocol.

## Not implemented / deferred

- **Session revocation on sign-out:** sessions are JWTs; sign-out clears the cookie, and tokens are invalidated on password, role or status changes, but an individual token is not revoked server-side.
- **Content-Security-Policy:** other security headers are set; a CSP (needs nonces for Next.js inline scripts) is not.
- **Server-side PDF reports:** reports have a print layout ("Print / Save as PDF" in the browser); there is no generated PDF file.
- **Machine-learning analytics:** none. Analytics are rule-based, threshold or simple statistics, and labelled that way.
- **Firmware OTA, device commands/actuation from the dashboard, maps with live tiles:** out of scope; actuator states (pump, lock) are displayed as reported telemetry only.
- **Horizontal scaling of realtime:** each app instance listens to PostgreSQL itself; there is no shared message bus.
- **Prisma config:** uses `package.json#prisma` (deprecated in Prisma 7; works in Prisma 6).
