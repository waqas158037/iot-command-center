import Link from "next/link";
import { Bell, Cpu, FileBarChart, Plus, Radio, ShieldAlert, Users } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { canGlobal, PROJECT_ROLE_LABELS } from "@/lib/permissions/policies";
import { simulatorAllowed } from "@/lib/env";
import { CATEGORY_LABELS } from "@/lib/project-types/types";
import { formatDate, formatDateTime, formatNumber, formatRelative, resolveRange, sp, titleCase } from "@/lib/format";
import { getMeasurement } from "@/lib/telemetry/measurements";
import { describeCondition, type Threshold } from "@/lib/telemetry/alert-logic";
import { getProject, listMembers, projectActivity } from "@/server/services/projects";
import { listDevices, listSensors } from "@/server/services/devices";
import { listAlertRules, listAlerts } from "@/server/services/alerts";
import { listUsers } from "@/server/services/users";
import { listSimulations } from "@/server/services/simulation";
import { projectWidgets } from "@/server/services/project-monitoring";
import { dashboardSummary } from "@/server/services/monitoring";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectStatusBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertBanner } from "@/components/ui/alert-banner";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectTabs, PROJECT_TABS, type ProjectTab } from "@/components/projects/project-tabs";
import { WidgetGrid } from "@/components/projects/widget-grid";
import { MembersManager } from "@/components/projects/members-manager";
import { SimulationPanel } from "@/components/projects/simulation-panel";
import { DeviceTable } from "@/components/devices/device-table";
import { AlertTable } from "@/components/alerts/alert-table";
import { Pagination } from "@/components/dashboard/pagination";
import { EmptyState } from "@/components/layout/states";
import { RANGE_OPTIONS } from "@/lib/format";
import { UrlFilters } from "@/components/dashboard/dashboard-filters";
import { LiveIndicator, LiveProvider } from "@/components/telemetry/realtime";
import { TelemetryTimeline } from "@/components/dashboard/charts";
import { deviceOptions, orNotFound } from "../../shared";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  try {
    const p = await getProject(user, id);
    return { title: p.name };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  const query = await searchParams;
  const project = await orNotFound(getProject(user, id));
  const tabParam = sp(query, "tab");
  const tab: ProjectTab = PROJECT_TABS.some((t) => t.key === tabParam) ? (tabParam as ProjectTab) : "overview";
  const page = sp(query, "page") ?? "1";
  const tz = user.timezone;
  const a = project.access;

  return (
    <LiveProvider projectId={id}>
      <PageHeader
        title={project.name}
        description={<><span className="font-mono">{project.projectCode}</span> · {project.projectType.name} · {CATEGORY_LABELS[project.projectType.category]}</>}
        badges={<><ProjectStatusBadge status={project.status} />{project.projectType.isSensitive && <Badge variant="warning">Health data · restricted</Badge>}</>}
        actions={
          <>
            <LiveIndicator />
            {a.canCreateDevice && <Button asChild variant="outline" size="sm"><Link href={`/devices/new?projectId=${id}`}><Cpu /> Register device</Link></Button>}
            {a.canUpdate && <Button asChild size="sm" variant="secondary"><Link href={`/projects/${id}/settings`}>Edit project</Link></Button>}
          </>
        }
      />
      {project.archivedAt && <AlertBanner variant="warning" className="mb-4">This project was archived on {formatDate(project.archivedAt, tz)}. It is read-only; historical data is retained.</AlertBanner>}
      {project.template?.safetyNotice && <AlertBanner variant="warning" className="mb-4"><ShieldAlert className="size-4 shrink-0" /><span>{project.template.safetyNotice}</span></AlertBanner>}
      <ProjectTabs projectId={id} active={tab} />

      {tab === "overview" && <Overview />}
      {tab === "monitoring" && <Monitoring />}
      {tab === "devices" && <Devices />}
      {tab === "sensors" && <Sensors />}
      {tab === "alerts" && <Alerts />}
      {tab === "reports" && <Reports />}
      {tab === "members" && <Members />}
      {tab === "simulation" && <Simulation />}
    </LiveProvider>
  );

  async function Overview() {
    const [summary, activity, widgets] = await Promise.all([
      dashboardSummary(user, { projectId: id }),
      projectActivity(user, id, 10),
      projectWidgets(user, id, new Date(Date.now() - 24 * 3600_000), new Date()),
    ]);
    const k = summary.kpis;
    const tiles = widgets.filter((w) => w.widget.type === "kpi" || w.widget.type === "state");
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Devices" value={formatNumber(k.registeredDevices)} icon={Cpu} hint={`${k.onlineDevices} online · ${k.offlineDevices} offline`} />
          <KpiCard label="Open alerts" value={formatNumber(k.activeAlerts)} icon={Bell} tone={k.criticalAlerts ? "danger" : k.activeAlerts ? "warning" : "default"} hint={`${k.criticalAlerts} critical`} />
          <KpiCard label="Readings (24h)" value={formatNumber(k.telemetryEvents)} icon={Radio} hint={`${formatNumber(k.simulatedEvents)} simulated`} />
          <KpiCard label="Members" value={formatNumber(project._count.members)} icon={Users} hint={a.role ? `You: ${PROJECT_ROLE_LABELS[a.role]}` : "Platform admin access"} />
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">Telemetry received (24h)</CardTitle><CardDescription>Hardware vs simulated readings stored for this project.</CardDescription></CardHeader>
            <CardContent><TelemetryTimeline data={summary.timeline} timeZone={tz} bucketSeconds={summary.range.bucketSeconds} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">About</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="text-muted-foreground">{project.description || project.projectType.description}</p>
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{project.owner.name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Started</dt><dd>{project.startedAt ? formatDate(project.startedAt, tz) : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Analytics</dt><dd>{project.template?.analyticsLabel ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Updated</dt><dd>{formatRelative(project.updatedAt)}</dd></div>
              </dl>
              {project.template?.analyticsNote && <p className="text-xs text-muted-foreground">{project.template.analyticsNote}</p>}
            </CardContent>
          </Card>
        </div>
        {tiles.length > 0 && <WidgetGrid widgets={tiles} timeZone={tz} />}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : (
              <ul className="divide-y text-sm">
                {activity.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><span className="font-medium">{e.actor?.name ?? "System"}</span> · <span className="font-mono text-xs">{e.action}</span></span>
                    <span className="text-muted-foreground" title={formatDateTime(e.createdAt, tz)}>{formatRelative(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  async function Monitoring() {
    const { from, to } = resolveRange(query, "24h");
    const deviceId = sp(query, "deviceId");
    const [widgets, devices] = await Promise.all([projectWidgets(user, id, from, to, deviceId), deviceOptions(user, id)]);
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <UrlFilters filters={[{ name: "range", label: "Date range", options: RANGE_OPTIONS, fallback: "24h" }, { name: "deviceId", label: "Device", allLabel: "All devices", options: devices }]} />
          <p className="text-xs text-muted-foreground">Widgets come from this project&apos;s configuration. Gaps in charts mean no readings were received.</p>
        </div>
        <WidgetGrid widgets={widgets} timeZone={tz} />
      </div>
    );
  }

  async function Devices() {
    const result = await listDevices(user, { projectId: id, page, search: sp(query, "search"), status: sp(query, "status") });
    return result.items.length === 0 ? (
      <EmptyState icon={Cpu} title="No devices yet" description="Register hardware (MQTT or HTTP) or start the simulator to create simulated devices." action={a.canCreateDevice ? <Button asChild><Link href={`/devices/new?projectId=${id}`}><Plus /> Register device</Link></Button> : undefined} />
    ) : (
      <Card>
        <DeviceTable devices={result.items} showProject={false} />
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath={`/projects/${id}`} searchParams={{ tab: "devices" }} />
      </Card>
    );
  }

  async function Sensors() {
    const result = await listSensors(user, { projectId: id, page: Number(page), pageSize: 50 });
    return (
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Sensor</TableHead><TableHead>Device</TableHead><TableHead className="hidden md:table-cell">Measurement</TableHead><TableHead className="hidden md:table-cell">Unit</TableHead><TableHead className="hidden lg:table-cell">Origin</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {result.items.map((s) => (
              <TableRow key={s.id}>
                <TableCell><div className="font-medium">{s.name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.sensorKey}</div></TableCell>
                <TableCell><Link className="hover:underline" href={`/devices/${s.device.id}`}>{s.device.name}</Link> {s.device.protocol === "SIMULATED" && <SimulatedBadge />}</TableCell>
                <TableCell className="hidden md:table-cell">{getMeasurement(s.sensorType)?.label ?? s.sensorType}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs">{s.unit}</TableCell>
                <TableCell className="hidden lg:table-cell">{titleCase(s.origin)}</TableCell>
                <TableCell>{s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Disabled</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {result.items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No sensors. Sensors are created with each device from the project template.</p>}
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath={`/projects/${id}`} searchParams={{ tab: "sensors" }} />
      </Card>
    );
  }

  async function Alerts() {
    const [alerts, rules] = await Promise.all([listAlerts(user, { projectId: id, page, status: sp(query, "status") }), listAlertRules(user, { projectId: id, pageSize: 50 })]);
    return (
      <div className="grid gap-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-base">Alerts</CardTitle><Button asChild variant="outline" size="sm"><Link href={`/alerts?projectId=${id}`}>Open in alert centre</Link></Button></CardHeader>
          {alerts.items.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">No alerts have been raised for this project.</p></CardContent> : <AlertTable alerts={alerts.items} showProject={false} />}
          <Pagination page={alerts.page} totalPages={alerts.totalPages} total={alerts.total} basePath={`/projects/${id}`} searchParams={{ tab: "alerts" }} />
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-base">Alert rules</CardTitle>{a.canManageRules && <Button asChild size="sm"><Link href={`/alert-rules?projectId=${id}`}>Manage rules</Link></Button>}</CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Severity</TableHead><TableHead className="hidden md:table-cell">Condition</TableHead><TableHead>Enabled</TableHead></TableRow></TableHeader>
            <TableBody>
              {rules.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant={r.severity === "CRITICAL" || r.severity === "HIGH" ? "danger" : r.severity === "MEDIUM" ? "warning" : "info"}>{titleCase(r.severity)}</Badge></TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{describeCondition(r.conditionType, r.thresholdConfiguration as Threshold, r.sensorType ? getMeasurement(r.sensorType)?.canonicalUnit : "")}</TableCell>
                  <TableCell>{r.isEnabled ? <Badge variant="success">On</Badge> : <Badge variant="muted">Off</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  async function Reports() {
    const reports = [
      { href: `/reports?projectId=${id}`, title: "Project summary", text: "Devices, readings, alerts and availability for this project." },
      { href: `/reports/telemetry?projectId=${id}`, title: "Telemetry & sensor statistics", text: "Min, max, average, completeness and trends per sensor." },
      { href: `/reports/devices?projectId=${id}`, title: "Device availability", text: "Online time, offline events and last-seen per device." },
      { href: `/reports/alerts?projectId=${id}`, title: "Alert history", text: "Alert counts by severity and rule, time to acknowledge and resolve." },
    ];
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <Link key={r.href} href={r.href} className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
            <p className="flex items-center gap-2 font-medium"><FileBarChart className="size-4 text-primary" /> {r.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
          </Link>
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-2">Template reports for this project type: {project.configuration.reports.map((r) => titleCase(r.replace(/-/g, " "))).join(", ")}.{!a.canExport && " CSV export requires a higher project role."}</p>
      </div>
    );
  }

  async function Members() {
    const [members, candidates] = await Promise.all([
      listMembers(user, id),
      a.canManageMembers && canGlobal(user, "users.view") ? listUsers(user, { pageSize: 100, status: "active" }).then((r) => r.items) : Promise.resolve([]),
    ]);
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Project members</CardTitle><CardDescription>Only members (and super admins) can see this project.</CardDescription></CardHeader>
        <CardContent><MembersManager projectId={id} members={members} candidates={candidates} canManage={a.canManageMembers} ownerId={project.owner.id} /></CardContent>
      </Card>
    );
  }

  async function Simulation() {
    const sessions = await listSimulations(user, id);
    return (
      <SimulationPanel
        projectId={id}
        enabled={simulatorAllowed()}
        canControl={a.canSimulate}
        timeZone={tz}
        sessions={sessions.map((s) => ({
          id: s.id,
          status: s.status,
          startedAt: s.startedAt.toISOString(),
          stoppedAt: s.stoppedAt?.toISOString() ?? null,
          lastTickAt: s.lastTickAt?.toISOString() ?? null,
          tickCount: s.tickCount,
          readingsCount: s.readingsCount,
          configuration: s.configuration as SessionConfig,
          startedBy: s.startedBy?.name ?? null,
        }))}
      />
    );
  }
}

type SessionConfig = { intervalSeconds: number; scenario: string; deviceCount: number };
