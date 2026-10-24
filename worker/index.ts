/**
 * Background worker: simulator ticks, device heartbeat checks, missing-data alerts,
 * email delivery, retention and the MQTT adapter.
 *
 *   npm run worker                    # everything
 *   npm run simulator                 # simulator + device health only
 *   WORKER_JOBS=health,mqtt npm run worker
 *
 * Each job runs under a PostgreSQL lease, so starting several workers never duplicates work.
 * Simulator readings additionally carry deterministic message IDs (idempotent inserts).
 */
import "dotenv/config";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { simulatorAllowed } from "@/lib/env";
import { startMqttAdapter } from "@/lib/mqtt/adapter";
import { acquireLease, releaseLease } from "@/server/jobs/lease";
import { runRetention } from "@/server/jobs/retention";
import { evaluateMissingReadings } from "@/server/services/alert-engine";
import { runDeviceHealthCheck } from "@/server/services/device-health";
import { processEmailDeliveries } from "@/server/services/notifications";
import { runSimulationTick } from "@/server/services/simulation";

const holderId = `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
const log = logger.child({ component: "worker", holderId });
const enabled = new Set((process.env.WORKER_JOBS ?? "simulator,health,missing,email,retention,mqtt").split(",").map((s) => s.trim()));

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const jobs: Job[] = [
  { name: "simulator", everyMs: 1000, run: () => runSimulationTick() },
  { name: "health", everyMs: 15_000, run: () => runDeviceHealthCheck() },
  { name: "missing", everyMs: 60_000, run: () => evaluateMissingReadings() },
  { name: "email", everyMs: 30_000, run: () => processEmailDeliveries() },
  { name: "retention", everyMs: 6 * 3600_000, run: () => runRetention() },
].filter((j) => enabled.has(j.name));

const timers: NodeJS.Timeout[] = [];
let stopping = false;

function schedule(job: Job) {
  let running = false;
  const tick = async () => {
    if (running || stopping) return; // never overlap a job with itself
    running = true;
    try {
      const ttl = Math.max(30, Math.ceil((job.everyMs * 3) / 1000));
      if (await acquireLease(`job:${job.name}`, holderId, ttl)) {
        const result = await job.run();
        if (job.name !== "simulator") log.debug({ job: job.name, result }, "job finished");
      }
    } catch (err) {
      log.error({ err, job: job.name }, "job failed");
    } finally {
      running = false;
    }
  };
  timers.push(setInterval(tick, job.everyMs));
  void tick();
}

async function main() {
  if (enabled.has("simulator") && !simulatorAllowed()) log.warn("simulator job enabled but the simulator is disabled by configuration");
  log.info({ jobs: jobs.map((j) => j.name) }, "worker starting");
  for (const job of jobs) schedule(job);

  let mqttClient: ReturnType<typeof startMqttAdapter> = null;
  let mqttLeaseTimer: NodeJS.Timeout | undefined;
  if (enabled.has("mqtt")) {
    // One adapter subscribes at a time unless a shared-subscription group spreads the load.
    const tryStart = async () => {
      const ok = process.env.MQTT_SHARED_GROUP ? true : await acquireLease("job:mqtt", holderId, 60);
      if (ok && !mqttClient) mqttClient = startMqttAdapter();
      if (!ok && mqttClient) {
        mqttClient.end();
        mqttClient = null;
      }
    };
    await tryStart();
    mqttLeaseTimer = setInterval(() => void tryStart().catch((err) => log.error({ err }, "mqtt lease failed")), 20_000);
  }

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "worker stopping");
    timers.forEach(clearInterval);
    if (mqttLeaseTimer) clearInterval(mqttLeaseTimer);
    mqttClient?.end();
    await Promise.all([...jobs.map((j) => releaseLease(`job:${j.name}`, holderId)), releaseLease("job:mqtt", holderId)]).catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
