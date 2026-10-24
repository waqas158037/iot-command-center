/** Formatting helpers usable on server and client. Timestamps are stored in UTC and shown in the user's time zone. */
export function formatDateTime(value: Date | string | null | undefined, timeZone = "UTC", opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone, ...opts }).format(d);
}

export function formatDate(value: Date | string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatRelative(value: Date | string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const diff = Math.round((now - new Date(value).getTime()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(-diff, "second");
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const RANGE_PRESETS = {
  "1h": 3600_000,
  "6h": 6 * 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 86400_000,
  "30d": 30 * 86400_000,
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

/** Resolves ?range= / ?from= / ?to= search params into a concrete window. */
export function resolveRange(sp: Record<string, string | string[] | undefined>, fallback: RangePreset = "24h") {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const to = get("to") ? new Date(get("to")!) : new Date();
  const preset = (get("range") as RangePreset) ?? fallback;
  const from = get("from") ? new Date(get("from")!) : new Date(to.getTime() - (RANGE_PRESETS[preset] ?? RANGE_PRESETS[fallback]));
  const valid = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to;
  return valid ? { from, to, preset: get("from") ? undefined : preset } : { from: new Date(Date.now() - RANGE_PRESETS[fallback]), to: new Date(), preset: fallback };
}

export function sp(searchParams: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = searchParams[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Date-range choices for URL filters (kept out of client modules so server components can use it). */
export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];
