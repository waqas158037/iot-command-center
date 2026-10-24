"use client";

import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { formatMeasurementValue, getMeasurement } from "@/lib/telemetry/measurements";
import { AXIS, GRID, SERIES_COLORS } from "./chart-theme";

export interface ChartSeries {
  sensorId: string;
  name: string;
  deviceName?: string;
  sensorType: string;
  unit: string;
  isSimulated?: boolean;
  points: { t: string; avg: number | null; min: number | null; max: number | null; count: number }[];
}

function fmtTime(t: number, spanMs: number, timeZone: string) {
  const opts: Intl.DateTimeFormatOptions = spanMs > 2 * 86400_000 ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit", hour12: false };
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(new Date(t));
}

/**
 * Time-series chart for one measurement. Series with a different unit than the first are
 * refused (rendered as a note) rather than plotted on a shared axis.
 */
export function TelemetryChart({ series, height = 240, kind = "line", timeZone = "UTC", showRange = true, emptyText = "No readings in this period." }: {
  series: ChartSeries[];
  height?: number;
  kind?: "line" | "bar";
  timeZone?: string;
  showRange?: boolean;
  emptyText?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const unit = series[0]?.unit;
  const plotted = series.filter((s) => s.unit === unit).slice(0, SERIES_COLORS.length);
  const skipped = series.length - plotted.length;
  const sensorType = plotted[0]?.sensorType ?? "";
  const def = getMeasurement(sensorType);
  const isState = def?.kind === "STATE";
  const single = plotted.length === 1;

  const { rows, span } = useMemo(() => {
    const map = new Map<number, Record<string, number | null>>();
    plotted.forEach((s, i) => {
      for (const p of s.points) {
        const t = new Date(p.t).getTime();
        const row = map.get(t) ?? { t };
        row[`s${i}`] = p.avg;
        if (single) row.range = p.min !== null && p.max !== null && p.max !== p.min ? ([p.min, p.max] as unknown as number) : null;
        map.set(t, row);
      }
    });
    const rows = [...map.values()].sort((a, b) => (a.t as number) - (b.t as number));
    const span = rows.length > 1 ? (rows[rows.length - 1].t as number) - (rows[0].t as number) : 0;
    return { rows, span };
  }, [plotted, single]);

  const hasData = rows.some((r) => plotted.some((_, i) => r[`s${i}`] !== null && r[`s${i}`] !== undefined));
  const values = rows.flatMap((r) => plotted.map((_, i) => r[`s${i}`])).filter((v): v is number => typeof v === "number");
  const summary = hasData
    ? `${plotted.map((s) => s.name).join(", ")}: ${values.length} points, min ${formatMeasurementValue(sensorType, Math.min(...values))}, max ${formatMeasurementValue(sensorType, Math.max(...values))}, latest ${formatMeasurementValue(sensorType, values[values.length - 1])}.`
    : emptyText;

  if (!hasData) return <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" style={{ height }}>{emptyText}</div>;

  const label = (i: number) => (plotted.length > 1 && plotted[i].deviceName && new Set(plotted.map((p) => p.name)).size < plotted.length ? `${plotted[i].deviceName} · ${plotted[i].name}` : plotted[i].name);
  const tickFmt = (v: number) => (isState ? (def?.stateLabels?.[v] ?? String(v)) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v));

  return (
    <figure className="relative">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="absolute -top-9 right-0 flex items-center gap-2">
        {plotted.some((s) => s.isSimulated) && <span className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.45_0.15_300)]">Simulated</span>}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={asTable ? "Show chart" : "Show data table"} aria-pressed={asTable}>
          {asTable ? <LineIcon className="size-4" /> : <Table2 className="size-4" />}
        </button>
      </div>
      {asTable ? (
        <div className="overflow-auto rounded-lg border" style={{ maxHeight: height }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted"><tr><th className="px-2 py-1 text-left">Time</th>{plotted.map((s, i) => <th key={s.sensorId} className="px-2 py-1 text-right">{label(i)}</th>)}</tr></thead>
            <tbody>
              {rows.slice().reverse().map((r) => (
                <tr key={r.t as number} className="border-t"><td className="px-2 py-1 tabular-nums">{new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(r.t as number))}</td>
                  {plotted.map((_, i) => <td key={i} className="px-2 py-1 text-right tabular-nums">{formatMeasurementValue(sensorType, r[`s${i}`] as number | null)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === "bar" ? (
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={2}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmtTime(t, span, timeZone)} {...AXIS} minTickGap={40} />
                <YAxis {...AXIS} width={48} tickFormatter={tickFmt} allowDecimals={!isState} />
                <Tooltip labelFormatter={(t) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(t as number))} formatter={(v) => formatMeasurementValue(sensorType, v as number)} />
                {plotted.map((s, i) => <Bar key={s.sensorId} dataKey={`s${i}`} name={label(i)} fill={SERIES_COLORS[i]} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
                {plotted.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
              </BarChart>
            ) : (
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmtTime(t, span, timeZone)} {...AXIS} minTickGap={40} />
                <YAxis {...AXIS} width={48} tickFormatter={tickFmt} domain={isState ? [0, "dataMax"] : ["auto", "auto"]} allowDecimals={!isState} />
                <Tooltip
                  labelFormatter={(t) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(t as number))}
                  formatter={(v, name) => (Array.isArray(v) ? [`${formatMeasurementValue(sensorType, v[0])} – ${formatMeasurementValue(sensorType, v[1])}`, "Min–max"] : [formatMeasurementValue(sensorType, v as number), name])}
                />
                {single && showRange && <Area dataKey="range" stroke="none" fill={SERIES_COLORS[0]} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} name="Min–max" legendType="none" />}
                {plotted.map((s, i) => (
                  <Line key={s.sensorId} type={isState ? "stepAfter" : "monotone"} dataKey={`s${i}`} name={label(i)} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={(d: { cx?: number; cy?: number; index?: number }) => {
                    // Points with no neighbour on either side would be invisible as a line; draw them as dots.
                    const k = `s${i}`, idx = d.index ?? 0;
                    const lone = rows[idx]?.[k] != null && rows[idx - 1]?.[k] == null && rows[idx + 1]?.[k] == null;
                    return lone && d.cx != null && d.cy != null ? <circle key={`${k}-${idx}`} cx={d.cx} cy={d.cy} r={3} fill={SERIES_COLORS[i]} /> : <g key={`${k}-${idx}`} />;
                  }} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} connectNulls={false} isAnimationActive={false} />
                ))}
                {plotted.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {def?.label ?? sensorType}{unit && unit !== "state" && unit !== "count" ? ` (${unit})` : ""}. Gaps mean no readings were received in that interval.
        {skipped > 0 && ` ${skipped} series with a different unit are not shown on this chart.`}
      </p>
    </figure>
  );
}
