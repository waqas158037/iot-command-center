import type { AlertConditionType, AlertSeverity, ProjectCategory, SensorOrigin } from "@prisma/client";

/** How the simulator produces values for a sensor. Deterministic given a seed. */
export type SimulationProfile =
  | { mode: "wave"; base: number; amplitude: number; noise: number; periodMinutes: number; min?: number; max?: number; abnormal: number }
  | { mode: "walk"; start: number; step: number; min: number; max: number; abnormal: number }
  | { mode: "counter"; start: number; ratePerHour: number; abnormalRatePerHour: number }
  | { mode: "drain"; start: number; perHour: number; min: number; abnormal: number }
  | { mode: "state"; states: number[]; weights: number[]; abnormal: number }
  | { mode: "event"; probability: number; abnormalProbability: number };

export interface SensorTemplate {
  key: string;
  name: string;
  measurement: string;
  origin?: SensorOrigin;
  description?: string;
  minValue?: number;
  maxValue?: number;
  simulation: SimulationProfile;
}

export type WidgetType = "kpi" | "line" | "state" | "bar";

export interface WidgetTemplate {
  id: string;
  type: WidgetType;
  title: string;
  /** Sensor keys from this template. Line widgets must only combine sensors that share a unit. */
  sensorKeys: string[];
  description?: string;
}

export interface AlertRuleTemplate {
  name: string;
  conditionType: AlertConditionType;
  /** Measurement key the rule applies to (all sensors of that type in the project). */
  sensorType?: string;
  threshold: Record<string, number>;
  severity: AlertSeverity;
  consecutiveCount?: number;
  cooldownSeconds?: number;
  autoResolve?: boolean;
  description?: string;
}

export type ConfigFieldType = "number" | "string" | "boolean" | "select";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: number | string | boolean;
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

export type ReportKey =
  | "project-overview"
  | "device-inventory"
  | "device-availability"
  | "telemetry-history"
  | "sensor-statistics"
  | "alert-history"
  | "alert-frequency"
  | "environmental-trends"
  | "agricultural-measurements"
  | "energy-consumption"
  | "health-telemetry"
  | "simulator-activity";

export interface ProjectTypeTemplate {
  key: string;
  name: string;
  category: ProjectCategory;
  description: string;
  /** Health and biometric projects: restricted access, privacy notices, no diagnoses. */
  isSensitive: boolean;
  /** Honest description of any analytics; never claims AI unless a model exists. */
  analyticsLabel: "Rule-based" | "Statistical analysis" | "Threshold monitoring";
  analyticsNote: string;
  deviceRequirements: string[];
  sensors: SensorTemplate[];
  widgets: WidgetTemplate[];
  alertRules: AlertRuleTemplate[];
  reports: ReportKey[];
  configSchema: ConfigField[];
  safetyNotice?: string;
}

/** The JSON stored in ProjectType.defaultConfiguration and copied to Project.configuration. */
export interface ProjectConfiguration {
  templateVersion: number;
  settings: Record<string, number | string | boolean>;
  widgets: WidgetTemplate[];
  sensors: SensorTemplate[];
  alertRules: AlertRuleTemplate[];
  reports: ReportKey[];
}

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  SMART_HOME_ENERGY: "Smart Home and Energy",
  WASTE_MANAGEMENT: "Waste Management",
  AGRICULTURE: "Agriculture",
  ENVIRONMENT_WEATHER: "Environment and Weather",
  HEALTHCARE_WEARABLES: "Healthcare and Wearables",
  LIVESTOCK: "Livestock",
  SECURITY_ACCESS: "Security and Access",
};
