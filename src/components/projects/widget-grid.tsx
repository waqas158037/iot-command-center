import { formatMeasurementValue } from "@/lib/telemetry/measurements";
import { formatRelative } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulatedBadge } from "@/components/dashboard/status-badges";
import { TelemetryChart } from "@/components/telemetry/telemetry-chart";
import { EmptyState } from "@/components/layout/states";
import type { WidgetData } from "@/server/services/project-monitoring";

/** Renders a project's template-configured widgets (KPI, state, line and bar). */
export function WidgetGrid({ widgets, timeZone }: { widgets: WidgetData[]; timeZone: string }) {
  if (widgets.length === 0) return <EmptyState title="No widgets configured" description="This project's configuration has no monitoring widgets." />;
  const tiles = widgets.filter((w) => w.widget.type === "kpi" || w.widget.type === "state");
  const charts = widgets.filter((w) => w.widget.type === "line" || w.widget.type === "bar");
  return (
    <div className="grid gap-4">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {tiles.map((w) => {
            const withData = w.latest.filter((l) => l.reading);
            const first = withData[0];
            return (
              <Card key={w.widget.id} className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{w.widget.title}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{first ? formatMeasurementValue(first.sensorType, first.reading!.value) : "—"}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {first ? <>{first.deviceName} · {formatRelative(first.reading!.occurredAt)}</> : w.latest.length ? "No readings yet" : "No sensor mapped"}
                  {first?.isSimulated && <SimulatedBadge />}
                </p>
                {withData.length > 1 && (
                  <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs">
                    {withData.slice(1, 4).map((l) => (
                      <li key={l.sensorId} className="flex justify-between gap-2"><span className="truncate text-muted-foreground">{l.deviceName}</span><span className="tabular-nums">{formatMeasurementValue(l.sensorType, l.reading!.value)}</span></li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {charts.map((w) => (
          <Card key={w.widget.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{w.widget.title}{w.unit && !["count", "state", "id", "raw"].includes(w.unit) && !w.widget.title.includes("(") ? ` (${w.unit})` : ""}</CardTitle>
              {w.widget.description && <CardDescription>{w.widget.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <TelemetryChart
                kind={w.widget.type === "bar" ? "bar" : "line"}
                timeZone={timeZone}
                series={w.series.map((s) => ({ sensorId: s.sensorId, name: s.name, deviceName: s.deviceName, sensorType: s.sensorType, unit: s.unit, isSimulated: s.isSimulated, points: s.points }))}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
