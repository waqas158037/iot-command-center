import Link from "next/link";
import { AlertTriangle, BellRing, Cpu, FolderKanban, FolderOpen, Plus, Radio, Wifi, WifiOff } from "lucide-react";
import type { ProjectCategory } from "@prisma/client";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal } from "@/lib/permissions/policies";
import { CATEGORY_LABELS } from "@/lib/project-types/types";
import { formatNumber, formatRelative, resolveRange, sp } from "@/lib/format";
import { dashboardSummary } from "@/server/services/monitoring";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge, SimulatedBadge, DeviceStatusBadge } from "@/components/dashboard/status-badges";
import { SensorActivityChart, StatusBars, TelemetryTimeline } from "@/components/dashboard/charts";
import { RANGE_OPTIONS } from "@/lib/format";
import { UrlFilters } from "@/components/dashboard/dashboard-filters";
import { LiveIndicator, LiveProvider } from "@/components/telemetry/realtime";
import { EmptyState } from "@/components/layout/states";
import { deviceOptions, projectOptions } from "../shared";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const { from, to } = resolveRange(params, "24h");
  const projectId = sp(params, "projectId");
  const category = sp(params, "category") as ProjectCategory | undefined;
  const deviceId = sp(params, "deviceId");

  const [summary, projects, devices] = await Promise.all([
    dashboardSummary(user, { from, to, projectId, category: category && category in CATEGORY_LABELS ? category : undefined, deviceId }),
    projectOptions(user),
    projectId ? deviceOptions(user, projectId) : Promise.resolve([]),
  ]);
  const k = summary.kpis;
  const canCreate = canGlobal(user, "project.create");

  return (
    <LiveProvider projectId={projectId} deviceId={deviceId}>
      <PageHeader
        title="Operations overview"
        description="Live status of every project, device and alert you have access to. Figures are computed from stored records for the selected period."
        actions={
          <>
            <LiveIndicator />
            {canCreate && <Button asChild variant="outline" size="sm"><Link href="/devices/new"><Cpu /> Register device</Link></Button>}
            {canCreate && <Button asChild size="sm"><Link href="/projects/new"><Plus /> New project</Link></Button>}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <UrlFilters
          filters={[
            { name: "range", label: "Date range", options: RANGE_OPTIONS, fallback: "24h" },
            { name: "category", label: "Category", allLabel: "All categories", options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })) },
            { name: "projectId", label: "Project", allLabel: "All projects", options: projects, resets: ["deviceId"] },
            ...(projectId ? [{ name: "deviceId", label: "Device", allLabel: "All devices", options: devices }] : []),
          ]}
        />
        {k.simulatedEvents > 0 && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <SimulatedBadge /> {k.simulatedEvents === k.telemetryEvents ? "All readings in this period are simulated" : `${formatNumber(k.simulatedEvents)} of ${formatNumber(k.telemetryEvents)} readings are simulated`}
          </span>
        )}
      </div>

      {summary.kpis.totalProjects === 0 ? (
        <EmptyState icon={FolderOpen} title="No projects yet" description={canCreate ? "Create your first project to start registering devices." : "You haven't been added to any projects yet. Ask a project manager for access."} action={canCreate ? <Button asChild><Link href="/projects/new"><Plus /> Create project</Link></Button> : undefined} />
      ) : (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
            <KpiCard label="Projects" value={k.totalProjects} icon={FolderKanban} />
            <KpiCard label="Active projects" value={k.activeProjects} icon={FolderKanban} tone="info" />
            <KpiCard label="Devices" value={k.registeredDevices} icon={Cpu} hint="All registered devices, including disabled ones." />
            <KpiCard label="Online" value={k.onlineDevices} icon={Wifi} tone="success" hint="Devices that sent telemetry within their heartbeat timeout (includes degraded)." />
            <KpiCard label="Offline" value={k.offlineDevices} icon={WifiOff} tone={k.offlineDevices ? "danger" : "default"} hint="Devices whose heartbeat timed out. Never-seen devices are counted as unknown." footer={k.unknownDevices ? `${k.unknownDevices} never connected` : undefined} />
            <KpiCard label="Open alerts" value={k.activeAlerts} icon={BellRing} tone={k.activeAlerts ? "warning" : "default"} hint="Active and acknowledged alerts." />
            <KpiCard label="Critical" value={k.criticalAlerts} icon={AlertTriangle} tone={k.criticalAlerts ? "danger" : "default"} />
            <KpiCard label="Readings" value={formatNumber(k.telemetryEvents)} icon={Radio} hint="Telemetry readings measured within the selected period." />
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader><CardTitle>Telemetry readings over time</CardTitle><CardDescription>Readings per {Math.round(summary.range.bucketSeconds / 60)}-minute interval, hardware vs simulated.</CardDescription></CardHeader>
              <CardContent><TelemetryTimeline data={summary.timeline} timeZone={user.timezone} bucketSeconds={summary.range.bucketSeconds} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Device connectivity</CardTitle><CardDescription>Current status from heartbeats.</CardDescription></CardHeader>
              <CardContent>
                <StatusBars data={summary.deviceStatus.map((d) => ({ key: d.status, count: d.count }))} order={["ONLINE", "DEGRADED", "OFFLINE", "UNKNOWN", "DISABLED"]} />
                <h4 className="mt-6 mb-3 text-sm font-semibold">Alerts raised by severity</h4>
                <StatusBars data={summary.severity.map((s) => ({ key: s.severity, count: s.count }))} order={["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]} />
              </CardContent>
            </Card>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader><CardTitle>Project health</CardTitle><CardDescription>Devices online and open alerts per project.</CardDescription></CardHeader>
              <CardContent className="px-0">
                <ul className="divide-y">
                  {summary.health.slice(0, 8).map((p) => {
                    const pct = p.totalDevices ? Math.round((p.onlineDevices / p.totalDevices) * 100) : 0;
                    return (
                      <li key={p.projectId} className="flex items-center gap-4 px-5 py-2.5">
                        <Link href={`/projects/${p.projectId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">{p.name}</Link>
                        <span className="hidden w-40 items-center gap-2 sm:flex">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></span>
                          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{p.onlineDevices}/{p.totalDevices}</span>
                        </span>
                        <span className={`w-20 text-right text-xs font-medium ${p.openAlerts ? "text-destructive" : "text-muted-foreground"}`}>{p.openAlerts} alert{p.openAlerts === 1 ? "" : "s"}</span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Sensor activity</CardTitle><CardDescription>Readings by measurement type.</CardDescription></CardHeader>
              <CardContent><SensorActivityChart data={summary.sensorActivity} /></CardContent>
            </Card>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>Recent alerts</CardTitle><Link href="/alerts" className="text-xs text-primary hover:underline">View all</Link></CardHeader>
              <CardContent className="px-0">
                {summary.recentAlerts.length === 0 ? <p className="px-5 pb-2 text-sm text-muted-foreground">No alerts.</p> : (
                  <ul className="divide-y">
                    {summary.recentAlerts.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                        <SeverityBadge severity={a.severity} />
                        <Link href={`/alerts/${a.id}`} className="min-w-0 flex-1 hover:text-primary">
                          <span className="block truncate text-sm font-medium">{a.title}</span>
                          <span className="block text-xs text-muted-foreground">{a.project.name} · {formatRelative(a.createdAt)} · {a.status.toLowerCase()}</span>
                        </Link>
                        {a.isSimulated && <SimulatedBadge />}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent connectivity changes</CardTitle></CardHeader>
              <CardContent className="px-0">
                {summary.recentStatus.length === 0 ? <p className="px-5 pb-2 text-sm text-muted-foreground">No status changes.</p> : (
                  <ul className="divide-y">
                    {summary.recentStatus.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                        <DeviceStatusBadge status={e.newStatus} />
                        <Link href={`/devices/${e.device.id}`} className="min-w-0 flex-1 hover:text-primary">
                          <span className="block truncate text-sm font-medium">{e.device.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{e.device.project.name} · {e.reason} · {formatRelative(e.occurredAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
          <p className="mt-4 text-xs text-muted-foreground">Period {from.toISOString().slice(0, 16).replace("T", " ")} – {to.toISOString().slice(0, 16).replace("T", " ")} UTC. Rendered {new Date().toISOString().slice(11, 19)} UTC.</p>
        </>
      )}
    </LiveProvider>
  );
}
