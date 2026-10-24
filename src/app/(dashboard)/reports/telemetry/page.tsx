import { requirePageUser } from "@/lib/auth/session";
import { formatDateTime, formatNumber, resolveRange, sp } from "@/lib/format";
import { formatMeasurementValue, getMeasurement } from "@/lib/telemetry/measurements";
import { MEASUREMENT_GROUPS, reportFilterSchema, resolveReportScope, sensorStatistics } from "@/server/services/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimulatedBadge } from "@/components/dashboard/status-badges";
import { ReportShell } from "@/components/reports/report-shell";
import { orNotFound, projectOptions } from "../../shared";

export const metadata = { title: "Telemetry report" };
const GROUPS = { environmental: "Environmental trends", agricultural: "Agricultural measurements", health: "Health telemetry (academic demo)" } as const;

export default async function TelemetryReportPage({ searchParams }: PageProps<"/reports/telemetry">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const { from, to } = resolveRange(params, "7d");
  const group = sp(params, "group") as keyof typeof GROUPS | undefined;
  const query = { projectId: sp(params, "projectId"), sensorType: sp(params, "sensorType") };
  const scope = await orNotFound(resolveReportScope(user, reportFilterSchema.parse({ ...query, from, to })));
  const [stats, projects] = await Promise.all([sensorStatistics(scope, group && group in GROUPS ? MEASUREMENT_GROUPS[group] : undefined), projectOptions(user)]);
  const types = [...new Set(stats.map((s) => s.sensorType))].map((k) => ({ value: k, label: getMeasurement(k)?.label ?? k }));
  return (
    <>
      <PageHeader title="Telemetry report" description="Per-sensor statistics for the period. Completeness is the share of hours that contain at least one reading." />
      <ReportShell active="/reports/telemetry" projects={projects} query={query} from={from} to={to} timeZone={user.timezone}
        extraFilters={[{ name: "group", label: "Group", allLabel: "All measurements", options: Object.entries(GROUPS).map(([value, label]) => ({ value, label })) }, { name: "sensorType", label: "Measurement", allLabel: "Any measurement", options: types }]}
        exports={[{ report: "sensor-stats", label: "Statistics CSV", group }, { report: "telemetry", label: "Raw readings CSV" }]}>
        {group === "health" && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">Health telemetry is shown for an academic demonstration. It is not a medical record and must not be used for diagnosis.</p>}
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Sensor</TableHead><TableHead className="hidden md:table-cell">Device / project</TableHead><TableHead className="text-right">Readings</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Avg</TableHead><TableHead className="text-right">Max</TableHead><TableHead className="hidden text-right lg:table-cell">Std dev</TableHead><TableHead className="text-right">Complete</TableHead><TableHead className="hidden xl:table-cell">Last reading</TableHead></TableRow></TableHeader>
            <TableBody>
              {stats.map((s) => (
                <TableRow key={s.sensorId}>
                  <TableCell><div className="font-medium">{s.sensorName}</div><div className="text-[11px] text-muted-foreground">{getMeasurement(s.sensorType)?.label ?? s.sensorType} · {s.unit}{s.origin !== "MEASURED" && ` · ${s.origin.toLowerCase()}`}</div></TableCell>
                  <TableCell className="hidden md:table-cell"><div>{s.deviceName} {s.isSimulated && <SimulatedBadge />}</div><div className="text-[11px] text-muted-foreground">{s.projectName}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(s.count)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMeasurementValue(s.sensorType, s.min)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.avg === null ? "—" : formatNumber(s.avg, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMeasurementValue(s.sensorType, s.max)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{s.stddev === null ? "—" : formatNumber(s.stddev, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(s.completeness * 100)}%</TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">{s.lastAt ? formatDateTime(s.lastAt, user.timezone) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {stats.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No sensors match these filters.</p>}
        </Card>
      </ReportShell>
    </>
  );
}
