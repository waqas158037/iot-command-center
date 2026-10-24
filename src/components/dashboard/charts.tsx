"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, SERIES_COLORS, STATUS_COLORS } from "@/components/telemetry/chart-theme";
import { getMeasurement } from "@/lib/telemetry/measurements";

const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function Empty({ text = "No data in this period.", height = 220 }: { text?: string; height?: number }) {
  return <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" style={{ height }}>{text}</div>;
}

/** Readings received per interval; hardware and simulated are stacked and labelled separately. */
export function TelemetryTimeline({ data, timeZone = "UTC", bucketSeconds }: { data: { t: string; simulated: number; hardware: number }[]; timeZone?: string; bucketSeconds: number }) {
  if (data.length === 0) return <Empty />;
  const rows = data.map((d) => ({ ...d, t: new Date(d.t).getTime() }));
  const span = rows[rows.length - 1].t - rows[0].t;
  const fmt = (t: number) => new Intl.DateTimeFormat("en-GB", span > 2 * 86400_000 ? { month: "short", day: "numeric", timeZone } : { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(t));
  const total = data.reduce((a, b) => a + b.simulated + b.hardware, 0);
  return (
    <figure>
      <figcaption className="sr-only">{total} telemetry readings over the period, in {Math.round(bucketSeconds / 60)}-minute intervals.</figcaption>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={1}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmt} {...AXIS} minTickGap={48} padding={{ left: 6, right: 6 }} />
            <YAxis {...AXIS} width={44} tickFormatter={compact} allowDecimals={false} />
            <Tooltip labelFormatter={(t) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(t as number))} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
            <Bar dataKey="hardware" name="Hardware (MQTT/HTTP)" stackId="a" fill={SERIES_COLORS[0]} isAnimationActive={false} />
            <Bar dataKey="simulated" name="Simulated" stackId="a" fill={SERIES_COLORS[6]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Horizontal status bars (status colours + text labels, never colour alone). */
export function StatusBars({ data, order, labels }: { data: { key: string; count: number }[]; order: string[]; labels?: Record<string, string> }) {
  const rows = order.map((k) => ({ key: k, label: labels?.[k] ?? k.charAt(0) + k.slice(1).toLowerCase(), count: data.find((d) => d.key === k)?.count ?? 0 }));
  const total = rows.reduce((a, b) => a + b.count, 0);
  if (total === 0) return <Empty height={160} />;
  return (
    <ul className="space-y-2.5" aria-label="Distribution">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground"><span className="size-2.5 rounded-full" style={{ background: STATUS_COLORS[r.key] }} aria-hidden />{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(r.count / total) * 100}%`, background: STATUS_COLORS[r.key] }} />
          </span>
          <span className="text-right font-medium tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function SensorActivityChart({ data }: { data: { sensorType: string; count: number }[] }) {
  if (data.length === 0) return <Empty />;
  const rows = data.map((d) => ({ name: getMeasurement(d.sensorType)?.label ?? d.sensorType, count: d.count }));
  return (
    <figure>
      <figcaption className="sr-only">Readings per measurement type: {rows.map((r) => `${r.name} ${r.count}`).join(", ")}.</figcaption>
      <div style={{ height: Math.max(160, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={4}>
            <CartesianGrid {...GRID} horizontal={false} vertical />
            <XAxis type="number" {...AXIS} tickFormatter={compact} />
            <YAxis type="category" dataKey="name" {...AXIS} width={130} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} formatter={(v) => [compact(v as number), "Readings"]} />
            <Bar dataKey="count" fill={SERIES_COLORS[0]} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map((_, i) => <Cell key={i} fill={SERIES_COLORS[0]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function DailyBars({ data, valueLabel, color = SERIES_COLORS[0], digits = 0 }: { data: { day: string; value: number }[]; valueLabel: string; color?: string; digits?: number }) {
  if (data.length === 0) return <Empty />;
  return (
    <figure>
      <figcaption className="sr-only">{valueLabel} per day: {data.map((d) => `${d.day} ${d.value.toFixed(digits)}`).join(", ")}.</figcaption>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={4}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" {...AXIS} minTickGap={24} />
            <YAxis {...AXIS} width={48} tickFormatter={compact} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} formatter={(v) => [(v as number).toFixed(digits), valueLabel]} />
            <Bar maxBarSize={48} dataKey="value" name={valueLabel} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
