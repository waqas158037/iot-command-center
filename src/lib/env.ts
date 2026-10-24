import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ENABLE_REGISTRATION: bool(false),
  ENABLE_SIMULATOR: bool(true),
  // Production deployments must opt in explicitly to simulator controls.
  ALLOW_SIMULATOR_IN_PRODUCTION: bool(false),
  DEVICE_HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).default(120),
  TELEMETRY_MAX_LATE_SECONDS: z.coerce.number().int().min(60).default(7 * 24 * 3600),
  TELEMETRY_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().min(0).default(300),
  INGEST_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  MQTT_BROKER_URL: z.string().optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_TOPIC_PREFIX: z.string().default("devices"),
  MQTT_CA_FILE: z.string().optional(),
  MQTT_REJECT_UNAUTHORIZED: bool(true),
  MQTT_BROKER_PORT: z.coerce.number().int().default(1883),
  MQTT_HOOK_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated server-side environment. Never import this from client components. */
export function env(): ServerEnv {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function simulatorAllowed(): boolean {
  const e = env();
  if (!e.ENABLE_SIMULATOR) return false;
  return e.NODE_ENV !== "production" || e.ALLOW_SIMULATOR_IN_PRODUCTION;
}

export function smtpConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_PORT && e.SMTP_FROM);
}

/** Only for tests that mutate process.env. */
export function resetEnvCache() {
  cached = undefined;
}
