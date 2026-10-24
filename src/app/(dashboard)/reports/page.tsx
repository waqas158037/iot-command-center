import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { formatNumber, resolveRange, sp } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/project-types/types";
import { energyReport, projectOverviewReport, reportFilterSchema, resolveReportScope, simulatorReport } from "@/server/services/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectStatusBadge } from "@/components/dashboard/status-badges";
import { DailyBars } from "@/components/dashboard/charts";
import { ReportShell } from "@/components/reports/report-shell";
import { orNotFound, projectOptions } from "../shared";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const { from, to } = resolveRange(params, "7d");
  const query = { projectId: sp(params, "projectId") };
  const scope = await orNotFound(resolveReportScope(user, reportFilterSchema.parse({ ...query, from, to })));
  const [overview, energy, sim, projects] = await Promise.all([projectOverviewReport(scope), energyReport(scope), simulatorReport(scope), projectOptions(user)]);
  const totals = overview.reduce((a, p) => ({ devices: a.devices + p._count.devices, readings: a.readings + p.readings, alerts: a.alerts + p.alerts }), { devices: 0, readings: 0, alerts: 0 });

  return (
    <>
      <PageHeader title="Reports" description="Summaries computed from stored telemetry, device status history and alerts." />
      <ReportShell active="/reports" projects={projects} query={query} from={from} to={to} timeZone={user.timezone} exports={[{ report: "devices", label: "Devices CSV" }, ...(energy.bySensor.length ? [{ report: "energy", label: "Energy CSV" }] : [])]}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Projects", overview.length], ["Devices", totals.devices], ["Readings", totals.readings], ["Alerts raised", totals.alerts]].map(([l, v]) => (
            <Card key={l} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(v as number)}</p></Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Project overview</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Devices (online)</TableHead><TableHead className="text-right">Readings</TableHead><TableHead className="text-right">Alerts</TableHead></TableRow></TableHeader>
            <TableBody>
              {overview.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><Link className="font-medium hover:underline" href={`/projects/${p.id}`}>{p.name}</Link><div className="font-mono text-[11px] text-muted-foreground">{p.projectCode}</div></TableCell>
                  <TableCell className="hidden md:table-cell">{CATEGORY_LABELS[p.projectType.category]}</TableCell>
                  <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{p._count.devices} ({p.onlineDevices})</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.readings)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.alerts)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {overview.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No projects in scope.</p>}
        </Card>
        {energy.bySensor.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Energy consumption: {formatNumber(energy.totalKwh, 2)} kWh</CardTitle><CardDescription>Sum of positive increases of cumulative kWh meters (meter resets ignored). Instantaneous power is never summed. Cost uses each project&apos;s tariff setting.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <DailyBars data={energy.daily.map((d) => ({ day: d.day, value: d.kwh }))} valueLabel="kWh" digits={2} />
              <Table>
                <TableHeader><TableRow><TableHead>Meter</TableHead><TableHead className="text-right">kWh</TableHead><TableHead className="text-right">Est. cost</TableHead></TableRow></TableHeader>
                <TableBody>{energy.bySensor.map((s) => <TableRow key={s.sensorId}><TableCell>{s.label}</TableCell><TableCell className="text-right tabular-nums">{formatNumber(s.kwh, 2)}</TableCell><TableCell className="text-right tabular-nums">{s.cost != null ? `${formatNumber(s.cost, 2)} ${s.currency ?? ""}` : "—"}</TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Simulator activity</CardTitle><CardDescription>Readings generated by the simulator per day. These are not hardware measurements.</CardDescription></CardHeader>
          <CardContent>{sim.daily.length ? <DailyBars data={sim.daily.map((d) => ({ day: d.day, value: d.count }))} valueLabel="Simulated readings" /> : <p className="text-sm text-muted-foreground">No simulated readings in this period.</p>}
            {sim.sessions.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{sim.sessions.length} simulation session(s) overlapped this period.</p>}
          </CardContent>
        </Card>
      </ReportShell>
    </>
  );
}
