import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatRelative, sp } from "@/lib/format";
import { formatMeasurementValue } from "@/lib/telemetry/measurements";
import { accessibleProjectIds } from "@/server/services/access";
import { latestReadingsForSensors } from "@/server/services/telemetry-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceStatusBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { UrlFilters } from "@/components/dashboard/dashboard-filters";
import { LiveIndicator, LiveProvider } from "@/components/telemetry/realtime";
import { LiveFeed } from "@/components/telemetry/live-feed";
import { EmptyState } from "@/components/layout/states";
import { projectOptions } from "../shared";

export const metadata = { title: "Live monitoring" };

export default async function MonitoringPage({ searchParams }: PageProps<"/monitoring">) {
  const user = await requirePageUser();
  const projects = await projectOptions(user);
  const requested = sp(await searchParams, "projectId");
  const projectId = projects.some((p) => p.value === requested) ? requested : projects[0]?.value;
  if (!projectId) return <EmptyState title="No projects" description="You need access to a project to monitor it." />;
  const ids = await accessibleProjectIds(user);
  if (ids && !ids.includes(projectId)) return null;

  const devices = await prisma.device.findMany({
    where: { projectId, status: { not: "DISABLED" } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 60,
    select: { id: true, name: true, status: true, protocol: true, lastSeenAt: true, sensors: { where: { isActive: true }, select: { id: true, name: true, sensorType: true }, orderBy: { name: "asc" }, take: 6 } },
  });
  const latest = await latestReadingsForSensors(devices.flatMap((d) => d.sensors.map((s) => s.id)));
  const deviceNames = Object.fromEntries(devices.map((d) => [d.id, d.name]));
  const sensorLabels = Object.fromEntries(devices.flatMap((d) => d.sensors.map((s) => [s.id, s.name])));

  return (
    <LiveProvider projectId={projectId} refreshMs={10_000}>
      <PageHeader title="Live monitoring" description="Device tiles refresh as events arrive (at most every 10 seconds). The feed shows each stored reading, alert and status change in real time." actions={<LiveIndicator />} />
      <div className="mb-4"><UrlFilters filters={[{ name: "projectId", label: "Project", options: projects, fallback: projectId }]} /></div>
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {devices.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">No active devices in this project.</p>}
          {devices.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/devices/${d.id}`} className="font-medium hover:underline">{d.name}</Link>
                <DeviceStatusBadge status={d.status} />
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">Last seen {d.lastSeenAt ? formatRelative(d.lastSeenAt) : "never"} {d.protocol === "SIMULATED" && <SimulatedBadge />}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {d.sensors.map((s) => (
                  <div key={s.id} className="min-w-0"><dt className="truncate text-[11px] text-muted-foreground">{s.name}</dt><dd className="font-medium tabular-nums">{formatMeasurementValue(s.sensorType, latest.get(s.id)?.value)}</dd></div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
        <Card className="self-start">
          <CardHeader className="pb-2"><CardTitle className="text-base">Event feed</CardTitle><CardDescription>Newest first. Kept in this browser tab only.</CardDescription></CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto"><LiveFeed deviceNames={deviceNames} sensorLabels={sensorLabels} /></CardContent>
        </Card>
      </div>
    </LiveProvider>
  );
}
