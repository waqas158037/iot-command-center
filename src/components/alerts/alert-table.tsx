import Link from "next/link";
import type { AlertSeverity, AlertStatus } from "@prisma/client";
import { formatRelative } from "@/lib/format";
import { formatMeasurementValue } from "@/lib/telemetry/measurements";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertStatusBadge, SeverityBadge, SimulatedBadge } from "@/components/dashboard/status-badges";

export interface AlertRow {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeringValue: { toNumber(): number } | number | null;
  lastValue: { toNumber(): number } | number | null;
  occurrenceCount: number;
  isSimulated: boolean;
  createdAt: Date;
  lastTriggeredAt: Date;
  project: { id: string; name: string; projectCode: string };
  device: { id: string; name: string } | null;
  sensor: { id: string; name: string; unit: string; sensorType: string } | null;
}

const num = (v: AlertRow["lastValue"]) => (v === null ? null : typeof v === "number" ? v : v.toNumber());

export function AlertTable({ alerts, showProject = true }: { alerts: AlertRow[]; showProject?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Severity</TableHead>
          <TableHead>Alert</TableHead>
          {showProject && <TableHead className="hidden md:table-cell">Project</TableHead>}
          <TableHead className="hidden lg:table-cell">Value</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Raised</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow key={a.id}>
            <TableCell><SeverityBadge severity={a.severity} /></TableCell>
            <TableCell className="max-w-80">
              <Link href={`/alerts/${a.id}`} className="font-medium hover:text-primary hover:underline">{a.title}</Link>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {a.device?.name}{a.sensor ? ` · ${a.sensor.name}` : ""}
                {a.occurrenceCount > 1 && <span>· ×{a.occurrenceCount}</span>}
                {a.isSimulated && <SimulatedBadge />}
              </div>
            </TableCell>
            {showProject && <TableCell className="hidden md:table-cell"><Link href={`/projects/${a.project.id}`} className="hover:underline">{a.project.name}</Link></TableCell>}
            <TableCell className="hidden tabular-nums lg:table-cell">{a.sensor ? formatMeasurementValue(a.sensor.sensorType, num(a.lastValue ?? a.triggeringValue)) : "—"}</TableCell>
            <TableCell><AlertStatusBadge status={a.status} /></TableCell>
            <TableCell className="text-right text-muted-foreground" title={a.createdAt.toISOString()}>{formatRelative(a.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
