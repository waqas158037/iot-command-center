import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { formatDateTime, formatNumber, resolveRange, sp } from "@/lib/format";
import { alertReport, reportFilterSchema, resolveReportScope } from "@/server/services/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertStatusBadge, SeverityBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { DailyBars, StatusBars } from "@/components/dashboard/charts";
import { ReportShell } from "@/components/reports/report-shell";
import { orNotFound, projectOptions } from "../../shared";

export const metadata = { title: "Alert report" };
const fmtMin = (m: number | null) => (m === null ? "—" : m < 60 ? `${m.toFixed(1)} min` : `${(m / 60).toFixed(1)} h`);

export default async function AlertReportPage({ searchParams }: PageProps<"/reports/alerts">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const { from, to } = resolveRange(params, "7d");
  const query = { projectId: sp(params, "projectId") };
  const scope = await orNotFound(resolveReportScope(user, reportFilterSchema.parse({ ...query, from, to })));
  const [r, projects] = await Promise.all([alertReport(scope), projectOptions(user)]);
  const total = r.bySeverity.reduce((a, b) => a + b.count, 0);
  return (
    <>
      <PageHeader title="Alert history" description="Alerts raised in the period, how often each rule fired, and response times." />
      <ReportShell active="/reports/alerts" projects={projects} query={query} from={from} to={to} timeZone={user.timezone} exports={[{ report: "alerts", label: "Alerts CSV" }]}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Alerts raised</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(total)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Still active</p><p className="text-2xl font-semibold tabular-nums">{r.byStatus.find((s) => s.status === "ACTIVE")?.count ?? 0}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Mean time to acknowledge</p><p className="text-2xl font-semibold tabular-nums">{fmtMin(r.mttaMinutes)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Mean time to resolve</p><p className="text-2xl font-semibold tabular-nums">{fmtMin(r.mttrMinutes)}</p></Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">By severity</CardTitle></CardHeader><CardContent><StatusBars data={r.bySeverity.map((s) => ({ key: s.severity, count: s.count }))} order={["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]} /></CardContent></Card>
          <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Alerts per day</CardTitle></CardHeader><CardContent>{r.daily.length ? <DailyBars data={r.daily.map((d) => ({ day: d.day, value: d.count }))} valueLabel="Alerts" /> : <p className="text-sm text-muted-foreground">No alerts in this period.</p>}</CardContent></Card>
        </div>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Most frequent rules</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead className="hidden sm:table-cell">Project</TableHead><TableHead className="text-right">Alerts</TableHead></TableRow></TableHeader>
            <TableBody>{r.byRule.map((x) => <TableRow key={x.ruleId ?? "none"}><TableCell>{x.name}</TableCell><TableCell className="hidden sm:table-cell">{x.project}</TableCell><TableCell className="text-right tabular-nums">{x.count}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Alerts ({Math.min(r.items.length, 500)} most recent)</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Raised</TableHead><TableHead>Alert</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Project</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.items.slice(0, 100).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt, user.timezone)}</TableCell>
                  <TableCell><Link className="hover:underline" href={`/alerts/${a.id}`}>{a.title}</Link> {a.isSimulated && <SimulatedBadge />}</TableCell>
                  <TableCell><SeverityBadge severity={a.severity} /></TableCell>
                  <TableCell><AlertStatusBadge status={a.status} /></TableCell>
                  <TableCell className="hidden md:table-cell">{a.project.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </ReportShell>
    </>
  );
}
