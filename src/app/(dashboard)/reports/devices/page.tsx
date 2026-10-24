import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { formatNumber, formatRelative, resolveRange, sp } from "@/lib/format";
import { deviceReport, reportFilterSchema, resolveReportScope } from "@/server/services/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeviceStatusBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { ReportShell } from "@/components/reports/report-shell";
import { orNotFound, projectOptions } from "../../shared";

export const metadata = { title: "Device report" };

export default async function DeviceReportPage({ searchParams }: PageProps<"/reports/devices">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const { from, to } = resolveRange(params, "7d");
  const query = { projectId: sp(params, "projectId") };
  const scope = await orNotFound(resolveReportScope(user, reportFilterSchema.parse({ ...query, from, to })));
  const [devices, projects] = await Promise.all([deviceReport(scope), projectOptions(user)]);
  const withAvail = devices.filter((d) => d.availability !== null);
  const avg = withAvail.length ? withAvail.reduce((a, d) => a + d.availability!, 0) / withAvail.length : null;
  return (
    <>
      <PageHeader title="Device availability" description="Availability is the share of the period a device was online or degraded, reconstructed from its status history." />
      <ReportShell active="/reports/devices" projects={projects} query={query} from={from} to={to} timeZone={user.timezone} exports={[{ report: "devices", label: "Devices CSV" }]}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Devices</p><p className="text-2xl font-semibold tabular-nums">{devices.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Average availability</p><p className="text-2xl font-semibold tabular-nums">{avg === null ? "—" : `${(avg * 100).toFixed(1)}%`}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Status changes</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(devices.reduce((a, d) => a + d.statusChanges, 0))}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Never reported</p><p className="text-2xl font-semibold tabular-nums">{devices.filter((d) => !d.lastSeenAt).length}</p></Card>
        </div>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Device</TableHead><TableHead className="hidden md:table-cell">Project</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Availability</TableHead><TableHead className="hidden text-right sm:table-cell">Readings</TableHead><TableHead className="hidden text-right lg:table-cell">Changes</TableHead><TableHead className="text-right">Last seen</TableHead></TableRow></TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><Link className="font-medium hover:underline" href={`/devices/${d.id}`}>{d.name}</Link> {d.protocol === "SIMULATED" && <SimulatedBadge />}<div className="font-mono text-[11px] text-muted-foreground">{d.deviceIdentifier}</div></TableCell>
                  <TableCell className="hidden md:table-cell">{d.project.name}</TableCell>
                  <TableCell><DeviceStatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.availability === null ? "—" : (
                      <span className="inline-flex items-center gap-2"><span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block" aria-hidden><span className="block h-full rounded-full bg-[#1baf7a]" style={{ width: `${d.availability * 100}%` }} /></span>{(d.availability * 100).toFixed(1)}%</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatNumber(d.readings)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{d.statusChanges}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{d.lastSeenAt ? formatRelative(d.lastSeenAt) : "Never"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {devices.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No devices in scope.</p>}
        </Card>
      </ReportShell>
    </>
  );
}
