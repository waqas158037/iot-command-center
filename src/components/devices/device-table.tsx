import Link from "next/link";
import type { DeviceProtocol, DeviceStatus } from "@prisma/client";
import { formatRelative } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeviceStatusBadge, SimulatedBadge } from "@/components/dashboard/status-badges";
import { Badge } from "@/components/ui/badge";

export interface DeviceRow {
  id: string;
  name: string;
  deviceIdentifier: string;
  protocol: DeviceProtocol;
  status: DeviceStatus;
  lastSeenAt: Date | null;
  firmwareVersion: string;
  locationDescription: string;
  project?: { id: string; name: string; projectCode: string };
  _count: { sensors: number };
}

export function DeviceTable({ devices, showProject = true }: { devices: DeviceRow[]; showProject?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Device</TableHead>
          {showProject && <TableHead className="hidden md:table-cell">Project</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Protocol</TableHead>
          <TableHead className="hidden lg:table-cell">Sensors</TableHead>
          <TableHead className="hidden lg:table-cell">Location</TableHead>
          <TableHead className="text-right">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((d) => (
          <TableRow key={d.id}>
            <TableCell>
              <Link href={`/devices/${d.id}`} className="font-medium hover:text-primary hover:underline">{d.name}</Link>
              <div className="font-mono text-[11px] text-muted-foreground">{d.deviceIdentifier}</div>
            </TableCell>
            {showProject && <TableCell className="hidden md:table-cell">{d.project && <Link href={`/projects/${d.project.id}`} className="hover:underline">{d.project.name}</Link>}</TableCell>}
            <TableCell><DeviceStatusBadge status={d.status} /></TableCell>
            <TableCell className="hidden sm:table-cell">{d.protocol === "SIMULATED" ? <SimulatedBadge /> : <Badge variant="outline">{d.protocol}</Badge>}</TableCell>
            <TableCell className="hidden tabular-nums lg:table-cell">{d._count.sensors}</TableCell>
            <TableCell className="hidden max-w-48 truncate text-muted-foreground lg:table-cell">{d.locationDescription || "—"}</TableCell>
            <TableCell className="text-right text-muted-foreground" title={d.lastSeenAt?.toISOString()}>{d.lastSeenAt ? formatRelative(d.lastSeenAt) : "Never"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
