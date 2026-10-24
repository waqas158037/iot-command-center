import Link from "next/link";
import { Bell, Cpu, FolderKanban, Gauge } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { sp } from "@/lib/format";
import { listProjects } from "@/server/services/projects";
import { listDevices, listSensors } from "@/server/services/devices";
import { listAlerts } from "@/server/services/alerts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceStatusBadge, SeverityBadge } from "@/components/dashboard/status-badges";
import { FilterBar } from "@/components/forms/filter-bar";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requirePageUser();
  const q = (sp(await searchParams, "q") ?? sp(await searchParams, "search") ?? "").slice(0, 100);
  const empty = { items: [], total: 0 };
  const [projects, devices, sensors, alerts] = q.length >= 2
    ? await Promise.all([listProjects(user, { search: q, pageSize: 8, includeArchived: true }), listDevices(user, { search: q, pageSize: 8 }), listSensors(user, { search: q, pageSize: 8 }), listAlerts(user, { search: q, pageSize: 8 })])
    : [empty, empty, empty, empty];
  const total = projects.total + devices.total + sensors.total + alerts.total;
  const Section = ({ title, icon: Icon, count, href, children }: { title: string; icon: typeof Cpu; count: number; href: string; children: React.ReactNode }) => (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4" /> {title} <span className="text-sm font-normal text-muted-foreground">({count})</span></CardTitle>{count > 8 && <Link href={href} className="text-sm text-primary hover:underline">View all</Link>}</CardHeader>
      <CardContent>{count === 0 ? <p className="text-sm text-muted-foreground">No matches.</p> : <ul className="divide-y text-sm">{children}</ul>}</CardContent>
    </Card>
  );
  return (
    <>
      <PageHeader title="Search" description={q.length >= 2 ? `${total} result${total === 1 ? "" : "s"} for “${q}” in projects you can access.` : "Type at least two characters."} />
      <Card className="mb-5"><FilterBar action="/search" search={q} searchPlaceholder="Search projects, devices, sensors, alerts…" /></Card>
      {q.length >= 2 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Projects" icon={FolderKanban} count={projects.total} href={`/projects?search=${encodeURIComponent(q)}`}>
            {projects.items.map((p) => <li key={p.id} className="py-2"><Link className="font-medium hover:underline" href={`/projects/${p.id}`}>{p.name}</Link> <span className="font-mono text-xs text-muted-foreground">{p.projectCode}</span></li>)}
          </Section>
          <Section title="Devices" icon={Cpu} count={devices.total} href={`/devices?search=${encodeURIComponent(q)}`}>
            {devices.items.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span><Link className="font-medium hover:underline" href={`/devices/${d.id}`}>{d.name}</Link> <span className="font-mono text-xs text-muted-foreground">{d.deviceIdentifier}</span></span><DeviceStatusBadge status={d.status} /></li>)}
          </Section>
          <Section title="Sensors" icon={Gauge} count={sensors.total} href={`/sensors?search=${encodeURIComponent(q)}`}>
            {sensors.items.map((s) => <li key={s.id} className="py-2"><Link className="font-medium hover:underline" href={`/devices/${s.device.id}`}>{s.name}</Link> <span className="text-xs text-muted-foreground">on {s.device.name}</span></li>)}
          </Section>
          <Section title="Alerts" icon={Bell} count={alerts.total} href={`/alerts?search=${encodeURIComponent(q)}`}>
            {alerts.items.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 py-2"><Link className="font-medium hover:underline" href={`/alerts/${a.id}`}>{a.title}</Link><SeverityBadge severity={a.severity} /></li>)}
          </Section>
        </div>
      )}
    </>
  );
}
