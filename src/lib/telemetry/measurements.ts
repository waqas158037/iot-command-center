/**
 * Canonical measurement catalog.
 *
 * Every sensor references one measurement key. Each measurement has a single canonical unit;
 * readings submitted in another supported unit are converted on ingestion so that one chart
 * never mixes units. Units that cannot be converted are rejected instead of guessed.
 */

export type MeasurementKind = "NUMERIC" | "STATE" | "EVENT";

interface UnitDef {
  /** Converts a value in this unit to the measurement's canonical unit. */
  toCanonical: (value: number) => number;
  aliases?: string[];
}

export interface MeasurementDef {
  key: string;
  label: string;
  kind: MeasurementKind;
  canonicalUnit: string;
  units: Record<string, UnitDef>;
  decimals: number;
  /** Labels for STATE measurements, keyed by the numeric code devices send. */
  stateLabels?: Record<number, string>;
  /** Marks physiological readings that require restricted access. */
  sensitive?: boolean;
}

const identity = (v: number) => v;
const scale = (factor: number) => (v: number) => v * factor;

function numeric(
  key: string,
  label: string,
  canonicalUnit: string,
  extraUnits: Record<string, UnitDef> = {},
  options: { decimals?: number; aliases?: string[]; sensitive?: boolean } = {},
): MeasurementDef {
  return {
    key,
    label,
    kind: "NUMERIC",
    canonicalUnit,
    units: { [canonicalUnit]: { toCanonical: identity, aliases: options.aliases }, ...extraUnits },
    decimals: options.decimals ?? 2,
    sensitive: options.sensitive,
  };
}

function state(key: string, label: string, stateLabels: Record<number, string>): MeasurementDef {
  return { key, label, kind: "STATE", canonicalUnit: "state", units: { state: { toCanonical: identity } }, decimals: 0, stateLabels };
}

function event(key: string, label: string, sensitive = false): MeasurementDef {
  return {
    key,
    label,
    kind: "EVENT",
    canonicalUnit: "count",
    units: { count: { toCanonical: identity, aliases: ["event", "events"] } },
    decimals: 0,
    sensitive,
  };
}

const PERCENT_ALIASES = ["percent", "pct", "%RH", "RH"];

export const MEASUREMENTS: Record<string, MeasurementDef> = Object.fromEntries(
  [
    // Electrical / energy
    numeric("power", "Power", "W", { kW: { toCanonical: scale(1000) } }, { decimals: 1 }),
    numeric("energy", "Energy", "kWh", { Wh: { toCanonical: scale(0.001) } }, { decimals: 3 }),
    numeric("voltage", "Voltage", "V", { mV: { toCanonical: scale(0.001) } }, { decimals: 1 }),
    numeric("current", "Current", "A", { mA: { toCanonical: scale(0.001) } }, { decimals: 3 }),
    state("occupancy", "Occupancy", { 0: "Vacant", 1: "Occupied" }),

    // Environment
    numeric(
      "temperature",
      "Temperature",
      "°C",
      { "°F": { toCanonical: (f) => ((f - 32) * 5) / 9, aliases: ["F", "degF", "fahrenheit"] } },
      { decimals: 1, aliases: ["C", "degC", "celsius"] },
    ),
    numeric("humidity", "Relative humidity", "%", {}, { decimals: 1, aliases: PERCENT_ALIASES }),
    numeric("pressure", "Atmospheric pressure", "hPa", { Pa: { toCanonical: scale(0.01) }, kPa: { toCanonical: scale(10) } }, { decimals: 1, aliases: ["mbar"] }),
    numeric("wind_speed", "Wind speed", "m/s", { "km/h": { toCanonical: scale(1 / 3.6), aliases: ["kmh", "kph"] } }, { decimals: 1 }),
    numeric("wind_direction", "Wind direction", "°", {}, { decimals: 0, aliases: ["deg", "degrees"] }),
    numeric("rainfall", "Rainfall", "mm", {}, { decimals: 1 }),
    numeric("solar_irradiance", "Solar irradiance", "W/m²", {}, { decimals: 0, aliases: ["W/m2"] }),
    numeric("pm25", "PM2.5", "µg/m³", {}, { decimals: 1, aliases: ["ug/m3", "μg/m³", "ug/m³"] }),
    numeric("pm10", "PM10", "µg/m³", {}, { decimals: 1, aliases: ["ug/m3", "μg/m³", "ug/m³"] }),
    numeric("co2", "CO₂", "ppm", {}, { decimals: 0 }),
    numeric("co", "Carbon monoxide", "ppm", {}, { decimals: 1 }),
    numeric("no2", "Nitrogen dioxide", "ppb", {}, { decimals: 1 }),
    // MQ-2 style smoke sensors report a raw ADC level, not a calibrated concentration.
    numeric("smoke_level", "Smoke sensor level (raw ADC)", "raw", {}, { decimals: 0, aliases: ["adc"] }),
    numeric("flame_ir", "IR flame sensor (raw ADC)", "raw", {}, { decimals: 0, aliases: ["adc"] }),

    // Agriculture
    numeric("soil_moisture", "Soil moisture", "%", {}, { decimals: 1, aliases: ["percent", "%VWC"] }),
    numeric("soil_ph", "Soil pH", "pH", {}, { decimals: 2 }),
    numeric("tank_level", "Tank level", "%", {}, { decimals: 0, aliases: ["percent"] }),
    numeric("water_flow", "Water flow", "L/min", { "L/h": { toCanonical: scale(1 / 60) } }, { decimals: 2, aliases: ["lpm"] }),
    state("pump_state", "Pump state", { 0: "Off", 1: "On" }),
    state("fertilizer_status", "Fertilizer delivery", { 0: "Idle", 1: "Dispensing", 2: "Fault" }),
    numeric("light", "Illuminance", "lx", {}, { decimals: 0, aliases: ["lux"] }),

    // Waste
    numeric("fill_level", "Bin fill level", "%", {}, { decimals: 0, aliases: ["percent"] }),
    numeric("weight", "Weight", "kg", { g: { toCanonical: scale(0.001) } }, { decimals: 2 }),
    numeric("distance", "Distance", "cm", { mm: { toCanonical: scale(0.1) }, m: { toCanonical: scale(100) } }, { decimals: 1 }),
    state("waste_class", "Waste classification", { 0: "Unknown", 1: "Organic", 2: "Plastic", 3: "Metal", 4: "Paper", 5: "Glass" }),
    state("collection_status", "Collection status", { 0: "Not due", 1: "Due", 2: "Collected" }),

    // Health (all sensitive)
    numeric("glucose", "Blood glucose", "mg/dL", { "mmol/L": { toCanonical: scale(18.0182), aliases: ["mmol/l"] } }, { decimals: 0, aliases: ["mg/dl"], sensitive: true }),
    numeric("heart_rate", "Heart rate", "BPM", {}, { decimals: 0, aliases: ["bpm"], sensitive: true }),
    numeric("spo2", "Oxygen saturation (SpO₂)", "%", {}, { decimals: 0, aliases: PERCENT_ALIASES, sensitive: true }),
    numeric(
      "body_temperature",
      "Body temperature",
      "°C",
      { "°F": { toCanonical: (f) => ((f - 32) * 5) / 9, aliases: ["F", "degF"] } },
      { decimals: 1, aliases: ["C", "degC"], sensitive: true },
    ),
    numeric("systolic_bp", "Systolic blood pressure", "mmHg", {}, { decimals: 0, sensitive: true }),
    numeric("diastolic_bp", "Diastolic blood pressure", "mmHg", {}, { decimals: 0, sensitive: true }),

    // Motion / IMU
    numeric("acceleration", "Acceleration magnitude", "m/s²", { g: { toCanonical: scale(9.80665) } }, { decimals: 2, aliases: ["m/s2"] }),
    numeric("angular_velocity", "Angular velocity", "°/s", { "rad/s": { toCanonical: scale(180 / Math.PI) } }, { decimals: 1, aliases: ["deg/s", "dps"] }),
    numeric("tilt_angle", "Tilt angle", "°", {}, { decimals: 1, aliases: ["deg", "degrees"] }),
    state("posture_state", "Posture classification", { 0: "Upright", 1: "Slouching", 2: "Leaning" }),
    numeric("posture_event_duration", "Poor-posture duration", "s", { min: { toCanonical: scale(60) } }, { decimals: 0 }),
    numeric("fall_confidence", "Fall-event confidence", "%", {}, { decimals: 0, aliases: ["percent"] }),
    event("fall_event", "Fall event", true),
    state("emergency_status", "Emergency notification", { 0: "None", 1: "Pending", 2: "Sent", 3: "Cancelled" }),
    numeric("activity_level", "Activity level", "steps/h", {}, { decimals: 0 }),
    state("activity_state", "Activity status", { 0: "Resting", 1: "Grazing", 2: "Walking", 3: "Running" }),

    // Location
    numeric("latitude", "Latitude", "°", {}, { decimals: 6 }),
    numeric("longitude", "Longitude", "°", {}, { decimals: 6 }),

    // Medication
    event("dose_dispensed", "Dose dispensed", true),
    event("dose_missed", "Missed dose", true),
    numeric("pill_inventory", "Pills remaining", "count", {}, { decimals: 0, aliases: ["pills"] }),

    // Access control
    state("lock_state", "Lock state", { 0: "Locked", 1: "Unlocked", 2: "Jammed" }),
    state("door_state", "Door state", { 0: "Closed", 1: "Open" }),
    state("access_event", "Access event", { 0: "None", 1: "Granted", 2: "Denied" }),
    event("failed_access", "Failed access attempt"),
    // Reference to an authorized user record on the lock (numeric ID, never a name or face image).
    numeric("authorized_user_ref", "Authorized user reference", "id", {}, { decimals: 0 }),

    // Device health
    numeric("battery", "Battery level", "%", {}, { decimals: 0, aliases: ["percent"] }),
    numeric("rssi", "Signal strength", "dBm", {}, { decimals: 0 }),
    state("device_status", "Device status", { 0: "OK", 1: "Warning", 2: "Fault" }),
  ].map((m) => [m.key, m]),
);

export function getMeasurement(key: string): MeasurementDef | undefined {
  return MEASUREMENTS[key];
}

export function listMeasurements(): MeasurementDef[] {
  return Object.values(MEASUREMENTS);
}

export type UnitConversion =
  | { ok: true; value: number; unit: string; converted: boolean }
  | { ok: false; reason: string };

/**
 * Converts a reported value into the sensor's canonical unit.
 * A missing unit is interpreted as the canonical unit.
 */
export function toCanonicalUnit(measurementKey: string, value: number, reportedUnit?: string | null): UnitConversion {
  const def = MEASUREMENTS[measurementKey];
  if (!def) return { ok: false, reason: `Unknown measurement type "${measurementKey}"` };
  if (!Number.isFinite(value)) return { ok: false, reason: "Value must be a finite number" };

  const unit = reportedUnit?.trim();
  if (!unit) return { ok: true, value, unit: def.canonicalUnit, converted: false };

  for (const [symbol, unitDef] of Object.entries(def.units)) {
    const names = [symbol, ...(unitDef.aliases ?? [])].map((n) => n.toLowerCase());
    if (names.includes(unit.toLowerCase())) {
      const converted = unitDef.toCanonical(value);
      return { ok: true, value: converted, unit: def.canonicalUnit, converted: symbol !== def.canonicalUnit };
    }
  }
  return {
    ok: false,
    reason: `Unit "${unit}" is not supported for ${def.label}; expected ${Object.keys(def.units).join(", ")}`,
  };
}

export function formatMeasurementValue(measurementKey: string, value: number | null | undefined, stateLabels?: Record<string, string>): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const def = MEASUREMENTS[measurementKey];
  if (!def) return String(value);
  if (def.kind === "STATE") {
    const labels = { ...(def.stateLabels ?? {}), ...(stateLabels ?? {}) } as Record<string, string>;
    return labels[String(Math.round(value))] ?? `State ${value}`;
  }
  const formatted = value.toFixed(def.decimals);
  if (def.canonicalUnit === "count" || def.canonicalUnit === "state" || def.canonicalUnit === "id") return formatted;
  return `${formatted} ${def.canonicalUnit}`;
}
