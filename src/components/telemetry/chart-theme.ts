/** Validated categorical order (dataviz reference palette). Assigned by series index, never cycled past 8. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** Status palette, reserved for state (never reused as a series colour). */
export const STATUS_COLORS: Record<string, string> = {
  ONLINE: "#1f9d62",
  DEGRADED: "#d99a06",
  OFFLINE: "#d6453d",
  UNKNOWN: "#94a3b8",
  DISABLED: "#cbd5e1",
  INFO: "#4b8fd6",
  LOW: "#94a3b8",
  MEDIUM: "#d99a06",
  HIGH: "#e2683c",
  CRITICAL: "#c42b2b",
};

export const AXIS = { stroke: "#94a3b8", fontSize: 11, tickLine: false, axisLine: false } as const;
export const GRID = { stroke: "#e5e9f0", strokeDasharray: "0", vertical: false } as const;
