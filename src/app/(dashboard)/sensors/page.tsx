import Link from "next/link";
import { Gauge } from "lucide-react";
import { requirePageUser } from "@/lib/auth/session";
import { formatRelative, sp, titleCase } from "@/lib/format";
import { formatMeasurementValue, getMeasurement, listMeasurements } from "@/lib/telemetry/measurements";
import { listSensors } from "@/server/services/devices";
import { latestReadingsForSensors } from "@/server/services/telemetry-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/forms/filter-bar";
import { Pagination } from "@/components/dashboard/pagination";
import { DeviceStatusBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { EmptyState } from "@/components/layout/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { orNotFound, projectOptions } from "../shared";

export const metadata = { title: "Sensors" };

export default async function SensorsPage({ searchParams }: PageProps<"/sensors">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = { search: sp(params, "search"), projectId: sp(params, "projectId"), sensorType: sp(params, "sensorType"), page: sp(params, "page") ?? "1" };
  const [result, projects] = await Promise.all([orNotFound(listSensors(user, { ...q, page: Number(q.page), pageSize: 30 })), projectOptions(user)]);
  const latest = await latestReadingsForSensors(result.items.map((s) => s.id));
  return (
    <>
      <PageHeader title="Sensors" description="Every sensor across your projects with its latest stored reading. Values are shown in each measurement's canonical unit." />
      <Card>
        <FilterBar action="/sensors" search={q.search} searchPlaceholder="Search sensor name or key…" selects={[
          { name: "projectId", label: "Project", value: q.projectId, options: projects },
          { name: "sensorType", label: "Measurement", value: q.sensorType, options: listMeasurements().map((m) => ({ value: m.key, label: m.label })) },
        ]} />
        {result.items.length === 0 ? <EmptyState icon={Gauge} className="border-0" title="No sensors found" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Sensor</TableHead><TableHead className="hidden md:table-cell">Measurement</TableHead><TableHead>Device</TableHead><TableHead className="hidden lg:table-cell">Project</TableHead><TableHead>Latest</TableHead><TableHead className="hidden sm:table-cell">State</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.items.map((s) => {
                const l = latest.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell><div className="font-medium">{s.name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.sensorKey}{s.origin !== "MEASURED" && ` · ${titleCase(s.origin)}`}</div></TableCell>
                    <TableCell className="hidden md:table-cell">{getMeasurement(s.sensorType)?.label ?? s.sensorType} <span className="font-mono text-xs text-muted-foreground">({s.unit})</span></TableCell>
                    <TableCell><Link className="hover:underline" href={`/devices/${s.device.id}`}>{s.device.name}</Link><div className="mt-0.5 flex gap-1"><DeviceStatusBadge status={s.device.status} />{s.device.protocol === "SIMULATED" && <SimulatedBadge />}</div></TableCell>
                    <TableCell className="hidden lg:table-cell"><Link className="hover:underline" href={`/projects/${s.device.project.id}`}>{s.device.project.name}</Link></TableCell>
                    <TableCell>{l ? <><div className="font-medium tabular-nums">{formatMeasurementValue(s.sensorType, l.value)}</div><div className="text-[11px] text-muted-foreground">{formatRelative(l.occurredAt)}</div></> : <span className="text-muted-foreground">No data</span>}</TableCell>
                    <TableCell className="hidden sm:table-cell">{s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Disabled</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/sensors" searchParams={q} />
      </Card>
    </>
  );
}
