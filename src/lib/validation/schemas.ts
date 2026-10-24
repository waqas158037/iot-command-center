/**
 * Zod schemas shared by API routes, server actions and client forms.
 * Server code always re-validates; client use is only for early feedback.
 */
import { z } from "zod";
import { MEASUREMENTS } from "@/lib/telemetry/measurements";

const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
const DEVICE_STATUSES = ["ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN", "DISABLED"] as const;
const PROTOCOLS = ["MQTT", "HTTP", "SIMULATED"] as const;
const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const ALERT_STATUSES = ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"] as const;
const CONDITIONS = ["THRESHOLD_ABOVE", "THRESHOLD_BELOW", "OUTSIDE_RANGE", "INSIDE_RANGE", "STATE_EQUALS", "DEVICE_OFFLINE", "MISSING_READINGS", "BATTERY_LOW"] as const;
const CATEGORIES = ["SMART_HOME_ENERGY", "WASTE_MANAGEMENT", "AGRICULTURE", "ENVIRONMENT_WEATHER", "HEALTHCARE_WEARABLES", "LIVESTOCK", "SECURITY_ACCESS"] as const;
const PROJECT_ROLES = ["MANAGER", "ENGINEER", "VIEWER"] as const;
const USER_ROLES = ["SUPER_ADMIN", "PROJECT_MANAGER", "ENGINEER", "VIEWER"] as const;

export const uuid = z.string().uuid("Invalid identifier");
const optionalDate = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional());
const nullableDate = z.preprocess((v) => (v === "" ? null : v), z.coerce.date().nullable().optional());
const optionalNumber = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().optional());
const nullableNumber = z.preprocess((v) => (v === "" ? null : v), z.coerce.number().nullable().optional());
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(values).optional());

// ── Projects ──────────────────────────────────────────────

export const projectCodeSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters")
  .max(20)
  .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only")
  .transform((s) => s.toUpperCase());

export const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(120),
  projectCode: projectCodeSchema,
  description: z.string().trim().max(2000).default(""),
  projectTypeKey: z.string().min(1, "Choose a project type"),
  status: z.enum(PROJECT_STATUSES).exclude(["ARCHIVED"]).default("PLANNING"),
  startedAt: optionalDate,
  endedAt: optionalDate,
  applyTemplateRules: z.coerce.boolean().default(true),
}).refine((d) => !d.startedAt || !d.endedAt || d.endedAt >= d.startedAt, { path: ["endedAt"], message: "End date must be after the start date" });
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startedAt: nullableDate,
  endedAt: nullableDate,
  settings: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const listProjectsSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: optionalEnum(PROJECT_STATUSES),
  category: optionalEnum(CATEGORIES),
  type: z.string().max(80).optional(),
  includeArchived: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  sort: z.enum(["name", "createdAt", "updatedAt", "projectCode"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});

export const addMemberSchema = z.object({ userId: uuid, projectRole: z.enum(PROJECT_ROLES) });
export const updateMemberSchema = z.object({ projectRole: z.enum(PROJECT_ROLES) });

// ── Devices ──────────────────────────────────────────────

export const deviceIdentifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "Letters, numbers, hyphens and underscores; must start with a letter or number");

export const createDeviceSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(2).max(120),
  deviceIdentifier: z.preprocess((v) => (v === "" ? undefined : v), deviceIdentifierSchema.optional()),
  hardwareModel: z.string().trim().max(120).default(""),
  firmwareVersion: z.string().trim().max(60).default(""),
  protocol: z.enum(PROTOCOLS),
  locationDescription: z.string().trim().max(200).default(""),
  latitude: optionalNumber.pipe(z.number().min(-90).max(90).optional()),
  longitude: optionalNumber.pipe(z.number().min(-180).max(180).optional()),
  heartbeatTimeoutSec: optionalNumber.pipe(z.number().int().min(10).max(7 * 24 * 3600).optional()),
  createTemplateSensors: z.coerce.boolean().default(true),
});
export type CreateDeviceInput = z.input<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  projectId: uuid.optional(),
  hardwareModel: z.string().trim().max(120).optional(),
  firmwareVersion: z.string().trim().max(60).optional(),
  locationDescription: z.string().trim().max(200).optional(),
  latitude: nullableNumber.pipe(z.number().min(-90).max(90).nullable().optional()),
  longitude: nullableNumber.pipe(z.number().min(-180).max(180).nullable().optional()),
  heartbeatTimeoutSec: nullableNumber.pipe(z.number().int().min(10).max(7 * 24 * 3600).nullable().optional()),
  configuration: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  active: z.boolean().optional(),
});
export type UpdateDeviceInput = z.input<typeof updateDeviceSchema>;

export const listDevicesSchema = z.object({
  search: z.string().trim().max(100).optional(),
  projectId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  status: optionalEnum(DEVICE_STATUSES),
  protocol: optionalEnum(PROTOCOLS),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const rotateCredentialSchema = z.object({
  graceMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60).default(0),
  expiresInDays: optionalNumber.pipe(z.number().int().min(1).max(3650).optional()),
});

// ── Sensors ──────────────────────────────────────────────

export const sensorKeySchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/, "Lower-case letters, numbers and underscores");

export const createSensorSchema = z
  .object({
    sensorKey: sensorKeySchema,
    name: z.string().trim().min(2).max(120),
    sensorType: z.string().refine((k) => k in MEASUREMENTS, "Unknown measurement type"),
    origin: z.enum(["MEASURED", "CALCULATED", "EXTERNAL"]).default("MEASURED"),
    description: z.string().trim().max(500).default(""),
    minValue: optionalNumber,
    maxValue: optionalNumber,
  })
  .refine((d) => d.minValue === undefined || d.maxValue === undefined || d.maxValue > d.minValue, { path: ["maxValue"], message: "Maximum must be greater than minimum" });
export type CreateSensorInput = z.input<typeof createSensorSchema>;

export const updateSensorSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  minValue: nullableNumber,
  maxValue: nullableNumber,
  isActive: z.boolean().optional(),
});

// ── Telemetry ingestion (device → platform) ──────────────────────

export const ingestReadingSchema = z.object({
  sensorKey: sensorKeySchema,
  value: z.number().finite(),
  unit: z.string().trim().max(20).optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
});

export const ingestPayloadSchema = z.object({
  messageId: z.string().trim().min(1).max(128).regex(/^[\w.:-]+$/, "messageId may contain letters, numbers, '.', ':', '_' and '-'").optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  readings: z.array(ingestReadingSchema).min(1, "At least one reading is required").max(100, "At most 100 readings per message"),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export const telemetryQuerySchema = z.object({
  projectId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  deviceId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  sensorId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  from: optionalDate,
  to: optionalDate,
  bucket: z.enum(["raw", "1m", "5m", "15m", "1h", "6h", "1d", "auto"]).default("auto"),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

// ── Alerts ──────────────────────────────────────────────

export const thresholdConfigSchema = z.object({
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  state: z.number().optional(),
  missingSeconds: z.number().int().min(30).optional(),
});

export const alertRuleBaseSchema = z.object({
  projectId: uuid,
  deviceId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  sensorId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  sensorType: z.preprocess((v) => (v === "" ? null : v), z.string().refine((k) => k in MEASUREMENTS, "Unknown measurement type").nullable().optional()),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).default(""),
  conditionType: z.enum(CONDITIONS),
  thresholdConfiguration: thresholdConfigSchema,
  severity: z.enum(SEVERITIES),
  consecutiveCount: z.coerce.number().int().min(1).max(100).default(1),
  cooldownSeconds: z.coerce.number().int().min(0).max(7 * 24 * 3600).default(300),
  autoResolve: z.coerce.boolean().default(false),
  isEnabled: z.coerce.boolean().default(true),
});

export function validateThreshold(conditionType: (typeof CONDITIONS)[number], t: z.infer<typeof thresholdConfigSchema>): string | null {
  switch (conditionType) {
    case "THRESHOLD_ABOVE":
    case "THRESHOLD_BELOW":
    case "BATTERY_LOW":
      return t.value === undefined ? "A threshold value is required" : null;
    case "OUTSIDE_RANGE":
    case "INSIDE_RANGE":
      if (t.min === undefined || t.max === undefined) return "Both minimum and maximum are required";
      return t.max <= t.min ? "Maximum must be greater than minimum" : null;
    case "STATE_EQUALS":
      return t.state === undefined ? "A state value is required" : null;
    case "MISSING_READINGS":
      return t.missingSeconds === undefined ? "A missing-data window (seconds) is required" : null;
    case "DEVICE_OFFLINE":
      return null;
  }
}

export const createAlertRuleSchema = alertRuleBaseSchema.superRefine((d, ctx) => {
  const err = validateThreshold(d.conditionType, d.thresholdConfiguration);
  if (err) ctx.addIssue({ code: "custom", path: ["thresholdConfiguration"], message: err });
  if (["THRESHOLD_ABOVE", "THRESHOLD_BELOW", "OUTSIDE_RANGE", "INSIDE_RANGE", "STATE_EQUALS"].includes(d.conditionType) && !d.sensorId && !d.sensorType) {
    ctx.addIssue({ code: "custom", path: ["sensorType"], message: "Choose a sensor or a measurement type" });
  }
});
export type CreateAlertRuleInput = z.input<typeof createAlertRuleSchema>;

export const updateAlertRuleSchema = alertRuleBaseSchema.omit({ projectId: true }).partial();

export const listAlertsSchema = z.object({
  projectId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  deviceId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  severity: optionalEnum(SEVERITIES),
  status: optionalEnum(ALERT_STATUSES),
  search: z.string().trim().max(100).optional(),
  from: optionalDate,
  to: optionalDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const alertActionSchema = z.object({
  action: z.enum(["acknowledge", "resolve", "note"]),
  notes: z.string().trim().max(2000).optional(),
});

// ── Users ──────────────────────────────────────────────

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(2).max(100).optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(USER_ROLES),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

export const notificationPreferencesSchema = z.object({
  minSeverity: z.enum(SEVERITIES).default("LOW"),
  deviceOffline: z.boolean().default(true),
  alertUpdates: z.boolean().default(true),
  email: z.boolean().default(false),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const ENUMS = { PROJECT_STATUSES, DEVICE_STATUSES, PROTOCOLS, SEVERITIES, ALERT_STATUSES, CONDITIONS, CATEGORIES, PROJECT_ROLES, USER_ROLES };
